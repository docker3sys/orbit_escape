// Both renderers look out on the same sky. Decode it once between flights.
let panorama;

export function flightPanorama(onLoad) {
  if (!panorama) {
    panorama = new Image();
    panorama.src = './assets/expedition-sky.jpg';
  }
  if (onLoad) {
    if (panorama.naturalWidth) onLoad(panorama);
    else panorama.addEventListener('load', () => onLoad(panorama), {once: true});
  }
  return panorama;
}
