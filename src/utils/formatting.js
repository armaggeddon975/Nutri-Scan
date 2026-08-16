export function formatNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: number < 1 ? 3 : 1,
  }).format(number);
}

export function formatTag(tag = "") {
  const cleanTag = tag
    .replace(/^[a-z]{2}:/, "")
    .replaceAll("-", " ");

  return cleanTag
    .split(" ")
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1))
    .join(" ");
}
