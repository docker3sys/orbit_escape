// Original artwork baked for a phone viewport. Each renderer loads only the objects it needs.
const files = {
  accretion: "./assets/campaign/accretion.webp",
  probe: "./assets/campaign/probe.webp",
  habitat: "./assets/campaign/habitat.webp",
  observatory: "./assets/campaign/observatory.webp",
  collar: "./assets/campaign/collar.webp",
  ice: "./assets/campaign/fractured-ice.webp",
  sky: "./assets/campaign/deep-field.jpg",
  hull: "./assets/campaign/hull-tiles.jpg",
  foil: "./assets/campaign/thermal-foil.jpg",
  panel: "./assets/campaign/photovoltaic.jpg",
};

export function campaignImage(key) {
  const image = new Image();
  image.src = files[key];
  return image;
}

export function campaignTexture(three, key, repeatX = 1, repeatY = 1) {
  const texture = new three.TextureLoader().load(files[key]);
  texture.colorSpace = three.SRGBColorSpace;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = texture.wrapT = three.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return texture;
}

export function makeCampaignBackdrop(chapter) {
  const sky = campaignImage("sky");
  const ice = campaignImage("ice");
  return function paint(ctx, w, h) {
    function repaint() {
      if (ctx.canvas.width === 0 || ctx.canvas.height === 0) return;
      ctx.fillStyle = "#050b14";
      ctx.fillRect(0, 0, w, h);
      if (sky.naturalWidth) {
        const zoom = Math.max(w / sky.naturalWidth, h / sky.naturalHeight);
        const sw = sky.naturalWidth * zoom, sh = sky.naturalHeight * zoom;
        ctx.save();
        if (chapter === "echo") { ctx.translate(w, h); ctx.rotate(Math.PI); }
        ctx.drawImage(sky, (w - sw) * (chapter === "echo" ? .25 : .72), (h - sh) * .45, sw, sh);
        ctx.restore();
      }
      if (ice.naturalWidth) {
        const unit = Math.min(w, h);
        const size = unit * (chapter === "echo" ? .94 : 1.12);
        const x = chapter === "echo" ? w - size * .23 : -size * .62;
        const y = chapter === "echo" ? -size * .52 : h - size * .30;
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        if (chapter === "last") ctx.rotate(1.16);
        ctx.drawImage(ice, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }
    repaint();
    // Resizing replaces each layer. A late decode may only repaint that layer.
    for (const im of [sky, ice]) {
      if (!im.complete) im.addEventListener("load", repaint, {once:true});
    }
  };
}
