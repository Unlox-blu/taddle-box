import { apiClient } from "./apiClient";

export type BookmarkResults = {
  types: any[];
  results: any[];
  filter: any;
};

export interface BookmarkResponse {
  success: boolean;
  message: string;
  data: {
    types: any[];
    results: any[];
  };
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export const bookmarkService = {
  async getBookmarks(page = 1, limit = 20, type = "all") {
    const response = await apiClient.get<any>("/bookmark", {
      params: { page, limit, type },
    });
    
    return {
      results: response.data?.data?.items || [],
      types: response.data?.data?.types || [],
      page: response.data?.data?.pagination?.page || page,
      hasNext: response.data?.data?.pagination?.hasNext || false,
    };
  },
};
