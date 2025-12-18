
import { FieldRegion, Particle } from "./types";

const DT = 0.01; // Smaller time step for better stability
const G = 9.8;    // Gravitational acceleration
const MAX_PATH_LENGTH = 1500;

/**
 * 物理引擎核心：使用 Boris 算法更新粒子运动
 * 约定：Bz > 0 表示磁场垂直纸面向里 (显示为 ×)
 * 坐标系：x向右为正，y向上为正
 */
export function updatePhysics(
  particles: Particle[], 
  regions: FieldRegion[], 
  gravityEnabled: boolean
): Particle[] {
  return particles.map(p => {
    let totalEx = 0;
    let totalEy = 0;
    let totalBz = 0;

    // 1. 计算当前位置的场强累加
    regions.forEach(r => {
      if (
        p.x >= r.x &&
        p.x <= r.x + r.width &&
        p.y >= r.y &&
        p.y <= r.y + r.height
      ) {
        totalEx += r.ex;
        totalEy += r.ey;
        totalBz += r.bz;
      }
    });

    /**
     * Boris Algorithm (Lorentz Force Integrator):
     * 1. v_minus = v + (q*E/m) * (dt/2)
     * 2. v_prime = v_minus + v_minus x t, where t = (q*B/m) * (dt/2)
     * 3. v_plus = v_minus + v_prime x s, where s = 2t / (1 + t^2)
     * 4. v_final = v_plus + (q*E/m) * (dt/2)
     * 
     * In 2D with Bz into screen (Vector B = [0, 0, -totalBz]):
     * v x B = [vx, vy, 0] x [0, 0, -totalBz] = [-vy*totalBz, vx*totalBz, 0]
     */

    const halfDt = DT / 2;
    const qOverM = p.q / p.m;

    // Include gravity as an effective electric field in the Y direction: Ey_eff = Ey - (m*g/q)
    // Fe_total = q*E + Fg = q*(E + Fg/q). Since Fg = [0, -mg, 0], Ey_eff = Ey - mg/q
    // However, it's safer to just add gravity acceleration separately at the end of the Boris steps.
    
    // Step 1: Half-step electric field update
    let vx = p.vx + qOverM * totalEx * halfDt;
    let vy = p.vy + qOverM * totalEy * halfDt;

    // Step 2: Magnetic field rotation (Boris Rotation)
    // Vector t = [0, 0, q * (-totalBz) / m * halfDt]
    const omega = qOverM * (-totalBz) * halfDt;
    
    // v_prime = v_minus + v_minus x t
    // v_minus x t = [vy_minus * omega, -vx_minus * omega, 0]
    const vpx = vx + vy * omega;
    const vpy = vy - vx * omega;

    // Step 3: Second rotation
    // s = 2t / (1 + t^2)
    const s = (2 * omega) / (1 + omega * omega);
    
    // v_plus = v_minus + v_prime x s
    // v_prime x s = [vpy * s, -vpx * s, 0]
    vx = vx + vpy * s;
    vy = vy - vpx * s;

    // Step 4: Final half-step electric field and full-step gravity
    vx = vx + qOverM * totalEx * halfDt;
    vy = vy + qOverM * totalEy * halfDt;
    
    if (gravityEnabled) {
      vy -= G * DT;
    }

    // 2. Position update
    const newX = p.x + vx * DT;
    const newY = p.y + vy * DT;

    // 3. Path logging
    const newPath = [...p.path, { x: newX, y: newY }];
    if (newPath.length > MAX_PATH_LENGTH) {
      newPath.shift();
    }

    return {
      ...p,
      x: newX,
      y: newY,
      vx: vx,
      vy: vy,
      path: newPath
    };
  });
}
