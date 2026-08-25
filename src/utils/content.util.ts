export const resolveContentId = (item: any): string => {
  if (!item) return "";
  return String(item.content_id || item.post_id || item.id || "");
};
