
export interface Vector2D {
  x: number;
  y: number;
}

export interface FieldRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ex: number; // Electric field X (N/C or V/m)
  ey: number; // Electric field Y
  bz: number; // Magnetic field Z (Tesla, into/out of screen)
  color: string;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number; // Mass (kg)
  q: number; // Charge (C)
  radius: number; // Size of the particle in pixels/units
  path: Vector2D[];
  color: string;
}

export interface SimulationState {
  regions: FieldRegion[];
  particles: Particle[];
  isPlaying: boolean;
  time: number;
  scale: number; // pixels per meter
  gravityEnabled: boolean;
}

export interface AISuggestion {
  problemDescription: string;
  suggestedRegions: Omit<FieldRegion, 'id' | 'color'>[];
  suggestedParticles: Omit<Particle, 'id' | 'path' | 'color' | 'radius'>[];
}
