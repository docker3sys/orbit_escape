import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Compile the same two game modules without needing a DOM or the generated vendor folder.
// Both imports of Three resolve to the installed module, also used by build:web.
const source = await build({
  stdin:{contents:"export * as Three from 'three'; export {createPlanetSurfaces} from './planet-surface.js';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},
  bundle:true,format:'esm',write:false,plugins:[{name:'game-three',setup(builder){
    builder.onResolve({filter:/vendor\/three\.module\.js$/},()=>({path:fileURLToPath(import.meta.resolve('three'))}));
  }}],
});
const {Three,createPlanetSurfaces}=await import(`data:text/javascript;base64,${Buffer.from(source.outputFiles[0].text).toString('base64')}`);

test('courier accepts its position vector and retains its orbital model at close range',t=>{
  t.mock.method(Three.TextureLoader.prototype,'load',()=>new Three.Texture());
  const renderer={capabilities:{maxTextureSize:2048,getMaxAnisotropy:()=>1}};
  const surfaces=createPlanetSurfaces(renderer,src=>'../'+src);
  const earth=surfaces.create('earth',6371,new Three.Vector3(1,0,0));
  surfaces.update(.4,new Three.Vector3(6371.05,0,0),'high');
  assert.equal(surfaces.sky,null);
  assert.equal(earth.geometry.parameters.widthSegments,64);
  assert.equal(earth.children.length,0);
  assert.equal(earth.material.visible,true);
  surfaces.dispose();
});
