import { BREVILABS_API_BASE_URL } from "@/constants";
import { getDecryptedKey } from "@/encryptionService";
import { logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { safeFetchNoThrow } from "@/utils";
import { arrayBufferToBase64 } from "@/utils/base64";

export interface RerankResponse {
  response: {
    object: string;
    data: Array<{
      relevance_score: number;
      index: number;
    }>;
    model: string;
    usage: {
      total_tokens: number;
    };
  };
  elapsed_time_ms: number;
}

export interface ToolCall {
  tool: any;
  args: any;
}

export interface Url4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface Pdf4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface Docs4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface WebSearchResponse {
  response: {
    choices: [
      {
        message: {
          content: string;
        };
      },
    ];
    citations: string[];
  };
  elapsed_time_ms: number;
}

export interface Youtube4llmResponse {
  response: {
    transcript: string;
  };
  elapsed_time_ms: number;
}

export interface Twitter4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface LicenseResponse {
  is_valid: boolean;
  plan: string;
}

export class BrevilabsClient {
  private static instance: BrevilabsClient;
  private pluginVersion: string = "Unknown";

  static getInstance(): BrevilabsClient {
    if (!BrevilabsClient.instance) {
      BrevilabsClient.instance = new BrevilabsClient();
    }
    return BrevilabsClient.instance;
  }

  setPluginVersion(pluginVersion: string) {
    this.pluginVersion = pluginVersion;
  }

  private async makeRequest<T>(
    endpoint: string,
    body: any,
    method = "POST",
    excludeAuthHeader = false,
    skipLicenseCheck = false
  ): Promise<{ data: T | null; error?: Error }> {
    // License check removed - all features are now available without validation
    body.user_id = getSettings().userId;

    const url = new URL(`${BREVILABS_API_BASE_URL}${endpoint}`);
    if (method === "GET") {
      // Add query parameters for GET requests
      Object.entries(body).forEach(([key, value]) => {
        url.searchParams.append(key, value as string);
      });
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Version": this.pluginVersion,
    };
    // Only add Authorization header if license key is provided
    if (!excludeAuthHeader) {
      const licenseKey = getSettings().plusLicenseKey;
      if (licenseKey) {
        headers.Authorization = `Bearer ${await getDecryptedKey(licenseKey)}`;
      }
    }
    const response = await safeFetchNoThrow(url.toString(), {
      method,
      headers,
      ...(method === "POST" && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      try {
        const errorDetail = data.detail;
        const error = new Error(errorDetail.reason);
        error.name = errorDetail.error;
        return { data: null, error };
      } catch {
        return { data: null, error: new Error("Unknown error") };
      }
    }
    logInfo(`[API ${endpoint} request]:`, data);

    return { data };
  }

  private async makeFormDataRequest<T>(
    endpoint: string,
    formData: FormData,
    skipLicenseCheck = false
  ): Promise<{ data: T | null; error?: Error }> {
    // License check removed - all features are now available without validation

    // Add user_id to FormData
    formData.append("user_id", getSettings().userId);

    const url = new URL(`${BREVILABS_API_BASE_URL}${endpoint}`);

    try {
      const headers: Record<string, string> = {
        // No Content-Type header - browser will set it automatically with boundary
        "X-Client-Version": this.pluginVersion,
      };
      // Only add Authorization header if license key is provided
      const licenseKey = getSettings().plusLicenseKey;
      if (licenseKey) {
        headers.Authorization = `Bearer ${await getDecryptedKey(licenseKey)}`;
      }
      const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        try {
          const errorDetail = data.detail;
          const error = new Error(errorDetail.reason);
          error.name = errorDetail.error;
          return { data: null, error };
        } catch {
          return { data: null, error: new Error(`HTTP error: ${response.status}`) };
        }
      }
      logInfo(`[API ${endpoint} form-data request]:`, data);
      return { data };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /**
   * Validate the license key.
   * All features are now available without license validation.
   * @returns Always returns valid: true
   */
  async validateLicenseKey(
    context?: Record<string, any>
  ): Promise<{ isValid: boolean; plan?: string }> {
    // All features are now available without license validation
    return { isValid: true, plan: "free" };
  }

  async rerank(query: string, documents: string[]): Promise<RerankResponse> {
    const { data, error } = await this.makeRequest<RerankResponse>("/rerank", {
      query,
      documents,
      model: "rerank-2",
    });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from rerank");
    }

    return data;
  }

  async url4llm(url: string): Promise<Url4llmResponse> {
    const { data, error } = await this.makeRequest<Url4llmResponse>("/url4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from url4llm");
    }

    return data;
  }

  async pdf4llm(binaryContent: ArrayBuffer): Promise<Pdf4llmResponse> {
    // Convert ArrayBuffer to base64 string
    const base64Content = arrayBufferToBase64(binaryContent);

    const { data, error } = await this.makeRequest<Pdf4llmResponse>("/pdf4llm", {
      pdf: base64Content,
    });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from pdf4llm");
    }

    return data;
  }

  async docs4llm(binaryContent: ArrayBuffer, fileType: string): Promise<Docs4llmResponse> {
    // Create a FormData object
    const formData = new FormData();

    // Convert ArrayBuffer to Blob with appropriate mime type
    const mimeType = this.getMimeTypeFromExtension(fileType);
    const blob = new Blob([binaryContent], { type: mimeType });

    // Create a File object with a filename including the extension
    const fileName = `file.${fileType}`;
    const file = new File([blob], fileName, { type: mimeType });

    // Append the file to FormData
    formData.append("files", file);

    // Add file_type as a regular field
    formData.append("file_type", fileType);

    const { data, error } = await this.makeFormDataRequest<Docs4llmResponse>("/docs4llm", formData);

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from docs4llm");
    }

    return data;
  }

  private getMimeTypeFromExtension(extension: string): string {
    const mimeMap: Record<string, string> = {
      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      epub: "application/epub+zip",
      txt: "text/plain",
      rtf: "application/rtf",

      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      tiff: "image/tiff",
      webp: "image/webp",

      // Web
      html: "text/html",
      htm: "text/html",

      // Spreadsheets
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      csv: "text/csv",

      // Audio
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      wav: "audio/wav",
      webm: "video/webm",
    };

    return mimeMap[extension.toLowerCase()] || "application/octet-stream";
  }

  async webSearch(query: string): Promise<WebSearchResponse> {
    const { data, error } = await this.makeRequest<WebSearchResponse>("/websearch", { query });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from websearch");
    }

    return data;
  }

  async youtube4llm(url: string): Promise<Youtube4llmResponse> {
    const { data, error } = await this.makeRequest<Youtube4llmResponse>("/youtube4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from youtube4llm");
    }

    return data;
  }

  async twitter4llm(url: string): Promise<Twitter4llmResponse> {
    const { data, error } = await this.makeRequest<Twitter4llmResponse>("/twitter4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from twitter4llm");
    }

    return data;
  }
}
