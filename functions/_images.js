const imageTypes = ["image/jpeg", "image/png", "image/webp"];

export function isImageType(type) {
  return imageTypes.includes(type);
}

export function isImageKey(key) {
  return typeof key === "string" && key.length <= 512 &&
    /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(key) &&
    !key.split("/").some(part => part === "." || part === "..");
}
