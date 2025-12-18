
import { GoogleGenAI, Type } from "@google/genai";
import { AISuggestion } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function parseProblem(input: string, imageData?: string): Promise<AISuggestion | null> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze this physics problem related to charged particles in electric and magnetic fields.
    Extract the following information to set up a 2D simulation:
    1. A clear summary of the problem in the ORIGINAL LANGUAGE (Chinese).
    2. The field regions (coordinates, dimensions, field strengths). Assume a coordinate system where (0,0) is a logical center.
    3. The particles (mass, charge, initial position, initial velocity).
    
    Coordinate System: 
    - x positive to right, y positive up.
    - Bz > 0 means magnetic field into the screen (visualized as 'X').
    
    Provide the response in structured JSON.
  `;

  const contents: any[] = [{ text: prompt }];
  if (input) contents.push({ text: `Text description: ${input}` });
  if (imageData) {
    contents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(",")[1],
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: contents },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problemDescription: { type: Type.STRING },
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

    return JSON.parse(response.text) as AISuggestion;
  } catch (error) {
    console.error("Error parsing problem with Gemini:", error);
    return null;
  }
}
