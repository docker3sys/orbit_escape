// Use the actual game surface once. Missing WebGL is an expected Android capability.
export function createGameRenderer(three, options) {
  const {canvas, antialias = false, powerPreference = "default"} = options;
  const context = canvas.getContext("webgl2", {
    alpha:true, depth:true, stencil:false, antialias, premultipliedAlpha:true,
    preserveDrawingBuffer:false, powerPreference, failIfMajorPerformanceCaveat:false,
  });
  if (!context) {
    const error = new Error("WebGL 2 unavailable");
    error.name = "GraphicsUnavailable";
    throw error;
  }
  return new three.WebGLRenderer({...options, context});
}
