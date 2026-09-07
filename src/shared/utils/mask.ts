export const maskEmail = (email: string) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 3)}${local.slice(-1)}@${domain}`;
};

export const maskPhone = (phone: string, countryCode?: string) => {
  if (!phone) return '';
  const full = countryCode ? `${countryCode}${phone}` : phone;
  if (full.length <= 4) return full;
  return `${full.slice(0, 3)}${'*'.repeat(full.length - 5)}${full.slice(-2)}`;
};
