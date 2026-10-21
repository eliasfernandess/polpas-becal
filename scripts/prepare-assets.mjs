import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const downloads = "C:/Users/namikz/Downloads";
const names = {
  morango: "22_47_05-9", maracuja: "22_46_59-3", manga: "22_47_03-8", abacaxi: "22_46_59-2",
  acerola: "22_47_02-6", limao: "22_47_02-7", "abacaxi-hortela": "22_47_00-4", "mix-frutas": "22_47_01-5", cajamanga: "22_47_05-10", tamarindo: "22_46_58-1",
};
await fs.mkdir("public/images/products", { recursive: true });
await fs.mkdir("public/images/brand", { recursive: true });
await fs.mkdir("public/fonts", { recursive: true });
for (const [id, suffix] of Object.entries(names)) {
  const source = path.join(downloads, `Imagem do ChatGPT 20 de out. de 2026, ${suffix}.png`);
  await sharp(source).resize(700, 700, { fit: "inside", withoutEnlargement: true }).webp({ quality: 87, alphaQuality: 100 }).toFile(`public/images/products/${id}.webp`);
}
const logo = path.join(downloads, "Imagem do ChatGPT 20 de out. de 2026, 22_14_00-1.png");
await sharp(logo).resize({ width: 740 }).webp({ quality: 95, alphaQuality: 100 }).toFile("public/images/brand/logo.webp");
const socialLogo = await sharp(logo).resize({ width: 930 }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#173f2e" } }).composite([{ input: socialLogo, gravity: "center" }]).jpeg({ quality: 90 }).toFile("public/images/brand/social.jpg");
for (const [source, target] of [
  ["dm-sans/files/dm-sans-latin-wght-normal.woff2", "dm-sans.woff2"],
  ["fraunces/files/fraunces-latin-wght-normal.woff2", "fraunces.woff2"],
  ["fraunces/files/fraunces-latin-wght-italic.woff2", "fraunces-italic.woff2"],
]) await fs.copyFile(`node_modules/@fontsource-variable/${source}`, `public/fonts/${target}`);
for (const font of ["dm-sans", "fraunces"]) {
  await fs.copyFile(`node_modules/@fontsource-variable/${font}/LICENSE`, `public/fonts/${font}-LICENSE.txt`);
}
console.log("10 produtos, logotipo, imagem social e fontes locais preparados.");

