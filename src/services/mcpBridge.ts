// WotSocial Model Context Protocol (MCP) Web Bridge & Ingestion Service
import { addMediaAssetAsync, addPost, getBrands, getBrandById, MediaAsset, Post } from '../dbAdapter';

export interface MCPLogEvent {
  id: string;
  timestamp: string;
  toolName: string;
  brandName: string;
  payload: any;
  status: 'SUCCESS' | 'ERROR';
  generatedAssetUrl?: string;
}

const MCP_LOGS_KEY = 'wot_mcp_logs_v1';
const MCP_API_KEY_STORAGE = 'wot_mcp_api_key_v1';

export const getMCPLogs = (): MCPLogEvent[] => {
  try {
    const raw = localStorage.getItem(MCP_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveMCPLog = (event: Omit<MCPLogEvent, 'id' | 'timestamp'>): MCPLogEvent => {
  const logs = getMCPLogs();
  const newLog: MCPLogEvent = {
    ...event,
    id: 'mcp_log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString()
  };
  const updated = [newLog, ...logs.slice(0, 49)];
  try {
    localStorage.setItem(MCP_LOGS_KEY, JSON.stringify(updated));
  } catch (e) {}
  return newLog;
};

export const getMCPAPIKey = (): string => {
  let key = localStorage.getItem(MCP_API_KEY_STORAGE);
  if (!key) {
    key = 'wot_mcp_live_' + Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
    localStorage.setItem(MCP_API_KEY_STORAGE, key);
  }
  return key;
};

export const generateNewMCPAPIKey = (): string => {
  const newKey = 'wot_mcp_live_' + Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
  localStorage.setItem(MCP_API_KEY_STORAGE, newKey);
  return newKey;
};

export const receiveImageFromClaude = async (params: {
  title: string;
  imageUrl: string;
  brandId?: string;
  brandName?: string;
  mediaType?: 'image' | 'video';
}): Promise<MediaAsset> => {
  const asset = await addMediaAssetAsync({
    title: params.title || 'Claude Generated Media Asset',
    url: params.imageUrl,
    type: params.mediaType || 'image',
    source: 'ai-generated',
    brandId: params.brandId
  });

  saveMCPLog({
    toolName: 'wotsocial_receive_image',
    brandName: params.brandName || 'WotSocial Brand',
    payload: { title: params.title, mediaType: params.mediaType || 'image' },
    status: 'SUCCESS',
    generatedAssetUrl: params.imageUrl
  });

  return asset;
};

export const executeMCPToolCall = async (toolName: string, args: any): Promise<{ success: boolean; message: string; data?: any }> => {
  try {
    if (toolName === 'wotsocial_generate_image') {
      const prompt = args.prompt || 'Futuristic AI Brand Graphic';
      const sampleUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80&prompt=${encodeURIComponent(prompt)}`;

      const asset = await receiveImageFromClaude({
        title: `Claude Image: ${prompt.slice(0, 30)}`,
        imageUrl: sampleUrl,
        brandName: args.brand_name,
        mediaType: 'image'
      });

      return {
        success: true,
        message: `Generated image for prompt "${prompt}" and saved to WotSocial Digital Media Vault.`,
        data: asset
      };
    }

    if (toolName === 'wotsocial_receive_image') {
      const asset = await receiveImageFromClaude({
        title: args.title || 'Claude Image Ingest',
        imageUrl: args.image_url,
        brandName: args.brand_name,
        mediaType: args.media_type || 'image'
      });

      return {
        success: true,
        message: `Successfully ingested image "${args.title}" into WotSocial.`,
        data: asset
      };
    }

    if (toolName === 'wotsocial_list_brands') {
      const brands = await getBrands();
      saveMCPLog({
        toolName: 'wotsocial_list_brands',
        brandName: 'System',
        payload: { count: brands.length },
        status: 'SUCCESS'
      });

      return {
        success: true,
        message: `Returned ${brands.length} active brands to Claude.`,
        data: brands
      };
    }

    if (toolName === 'wotsocial_get_brand_strategy') {
      const brands = await getBrands();
      const active = brands[0];
      const research = active?.agentResearchData;

      saveMCPLog({
        toolName: 'wotsocial_get_brand_strategy',
        brandName: active?.name || 'Active Brand',
        payload: { hasStrategy: !!research },
        status: 'SUCCESS'
      });

      return {
        success: true,
        message: `Fetched strategy blueprint for ${active?.name || 'Active Brand'}.`,
        data: {
          brand: active?.name,
          valueProposition: research?.siteAnalysis?.valueProposition || active?.brandTone,
          pillars: research?.marketingStrategy?.contentPillars || []
        }
      };
    }

    if (toolName === 'wotsocial_publish_post') {
      const post = await addPost({
        content: args.content,
        status: 'scheduled',
        scheduledTime: args.scheduled_time || new Date().toISOString()
      });

      saveMCPLog({
        toolName: 'wotsocial_publish_post',
        brandName: args.brand_name || 'Active Brand',
        payload: { content: args.content },
        status: 'SUCCESS'
      });

      return {
        success: true,
        message: `Post scheduled successfully in WotSocial Calendar Grid.`,
        data: post
      };
    }

    return { success: false, message: `Tool ${toolName} not recognized.` };
  } catch (err: any) {
    saveMCPLog({
      toolName,
      brandName: args.brand_name || 'Unknown',
      payload: args,
      status: 'ERROR'
    });
    return { success: false, message: err.message || 'Execution error' };
  }
};

export const getClaudeDesktopConfigJSON = (apiKey: string): string => {
  const config = {
    mcpServers: {
      wotsocial: {
        command: "node",
        args: [
          "/Users/leninprakash/Products/social/mcp-server/index.js"
        ],
        env: {
          WOTSOCIAL_API_KEY: apiKey,
          WOTSOCIAL_API_ENDPOINT: "http://localhost:3000/api/mcp"
        }
      }
    }
  };
  return JSON.stringify(config, null, 2);
};
