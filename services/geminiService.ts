import { GoogleGenAI, Type } from "@google/genai";
import { ConfigAnalysis, ConfigProtocol, Operator } from "../types";

export const analyzeConfigString = async (configStr: string): Promise<ConfigAnalysis> => {
  try {
    // Initialize AI instance here instead of top-level to prevent crash if API_KEY is missing on load
    if (!process.env.API_KEY) {
        throw new Error("API_KEY is missing");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following VPN/Proxy configuration string strictly. 
      Decode base64 if necessary to extract info. 
      
      Config String: "${configStr}"
      
      Return a JSON object with:
      - protocol: One of [VMess, VLESS, Trojan, Shadowsocks, TUIC, Hysteria, WireGuard, Unknown]
      - alias: A readable name.
      - server: The IP or Domain.
      - port: The port number.
      - location: Estimated country code (e.g. US, DE, IR).
      - security: 'High' (TLS/Reality), 'Medium', or 'Low' (No TLS).
      - tags: Array of strings.
      - isp: Best guess for suitable Iranian Operator based on Alias/Remarks/Protocol. Options: ['MCI', 'Irancell', 'TCI', 'RighTel', 'All', 'Unknown'].
         - Examples: "MCI" in name -> "MCI". "MTN" -> "Irancell". "Reality" protocol -> "All".
      - avgPing: Extract latency number (ms) if present in the name (e.g. "Server-120ms" -> 120). If not found, return null.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            protocol: { type: Type.STRING },
            alias: { type: Type.STRING },
            server: { type: Type.STRING },
            port: { type: Type.STRING },
            location: { type: Type.STRING },
            security: { type: Type.STRING },
            tags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            isp: { type: Type.STRING },
            avgPing: { type: Type.NUMBER, nullable: true }
          },
          required: ["protocol", "alias", "server", "port", "security", "isp"]
        }
      }
    });

    if (!response.text) {
        throw new Error("No response from AI");
    }

    const data = JSON.parse(response.text);
    
    // Normalize protocol enum
    let protocol = ConfigProtocol.UNKNOWN;
    const pUpper = data.protocol?.toUpperCase();
    if (pUpper.includes('VMESS')) protocol = ConfigProtocol.VMESS;
    else if (pUpper.includes('VLESS')) protocol = ConfigProtocol.VLESS;
    else if (pUpper.includes('TROJAN')) protocol = ConfigProtocol.TROJAN;
    else if (pUpper.includes('SHADOW')) protocol = ConfigProtocol.SHADOWSOCKS;
    else if (pUpper.includes('TUIC')) protocol = ConfigProtocol.TUIC;
    else if (pUpper.includes('HYSTERIA')) protocol = ConfigProtocol.HYSTERIA;
    else if (pUpper.includes('WIRE')) protocol = ConfigProtocol.WIREGUARD;

    // Normalize ISP
    let isp: Operator = 'Unknown';
    const rawIsp = data.isp?.toUpperCase() || '';
    if (rawIsp === 'MCI') isp = 'MCI';
    else if (rawIsp === 'IRANCELL' || rawIsp === 'MTN') isp = 'Irancell';
    else if (rawIsp === 'TCI' || rawIsp.includes('MOKH')) isp = 'TCI';
    else if (rawIsp.includes('RIGHT')) isp = 'RighTel';
    else if (rawIsp === 'ALL') isp = 'All';

    return {
      protocol,
      alias: data.alias || 'Unnamed',
      server: data.server || 'Unknown',
      port: data.port || '0',
      location: data.location || 'Unknown',
      security: (data.security as 'High' | 'Medium' | 'Low') || 'Medium',
      tags: data.tags || [],
      isp,
      avgPing: data.avgPing || null
    };

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      protocol: ConfigProtocol.UNKNOWN,
      alias: 'خطا در آنالیز',
      server: '---',
      port: '---',
      location: 'Unknown',
      security: 'Low',
      tags: ['Manual'],
      isp: 'Unknown',
      avgPing: null
    };
  }
};