
import { GoogleGenAI, Type } from "@google/genai";
import { AISuggestion } from "./types";

/**
 * 使用 Gemini 3 Pro 解析物理题目。
 * 专注于从题目文本或截图中提取场分布参数和粒子初始条件。
 */
export async function parseProblem(input: string, imageData?: string): Promise<AISuggestion | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";
  
  const prompt = `
    作为资深物理建模专家，请分析此电磁学题目。
    你需要：
    1. 生成 100 字以内的中文物理过程摘要（侧重于粒子的偏转、加速或圆周运动描述）。
    2. 定义若干矩形场区域 (Field Regions)。每个区域包含 (x, y, width, height) 坐标系单位，以及 Ex, Ey 电场分量和 Bz 磁场分量。
    3. 定义初始状态的带电粒子 (Particles)。包含质量 m, 电量 q, 初始坐标 (x, y) 和初速度 (vx, vy)。
    
    输出约束：
    - 坐标系：x向右为正，y向上为正。
    - Bz > 0 为垂直纸面向里 (X)。
    - 确保数值量级适合 2D 模拟（如速度在 50-500 之间，坐标在 -500 到 500 之间）。
    - 结果必须是合法的 JSON。
  `;

  const parts: any[] = [{ text: prompt }];
  if (input) parts.push({ text: `题目描述：${input}` });
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(",")[1],
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problemDescription: { type: Type.STRING, description: "中文物理题目核心摘要" },
            suggestedRegions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  ex: { type: Type.NUMBER },
                  ey: { type: Type.NUMBER },
                  bz: { type: Type.NUMBER },
                },
                required: ["x", "y", "width", "height", "ex", "ey", "bz"],
              },
            },
            suggestedParticles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  vx: { type: Type.NUMBER },
                  vy: { type: Type.NUMBER },
                  m: { type: Type.NUMBER },
                  q: { type: Type.NUMBER },
                },
                required: ["x", "y", "vx", "vy", "m", "q"],
              },
            },
          },
          required: ["problemDescription", "suggestedRegions", "suggestedParticles"],
        },
      },
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as AISuggestion;
  } catch (error) {
    console.error("Gemini Physics Parser Error:", error);
    return null;
  }
}
