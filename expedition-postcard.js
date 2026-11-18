const memories = {
  people: {title:"«Створ» на связи",line:"Шестеро вернулись домой.",tag:"КРОМКА 12   /   СТВОР 06", file:"stvor"},
  relay: {title:"Чистый эфир",line:"Теперь их сигнал доходит до Земли.",tag:"КРОМКА 18   /   РЕТРАНСЛЯТОР В СЕТИ",file:"beacon"},
};
let cached;
function line(ctx,x,y,endX,endY) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(endX,endY);ctx.stroke();
}

async function makeFile(choice) {
  const m=memories[choice];
  if (!m) throw new Error("Unknown outcome");
  const canvas=document.createElement("canvas");
  canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#080f18";ctx.fillRect(0,0,1080,1350);
  const picture=new Image();
  picture.src="./assets/beacon-cover.jpg";
  try {
    await picture.decode();
    ctx.drawImage(picture,340,0,1200,1100,0,0,1080,990);
  } catch { /* The flight log also has a vector-only layout. */ }
  const fade=ctx.createLinearGradient(0,530,0,1020);
  fade.addColorStop(0,"rgba(8,15,24,0)");fade.addColorStop(1,"#080f18");
  ctx.fillStyle=fade;ctx.fillRect(0,530,1080,490);
  ctx.fillStyle="#080f18";ctx.fillRect(0,1020,1080,330);
  ctx.fillStyle="#fbcb9b";ctx.font="600 25px monospace";ctx.fillText("O R B I T   E S C A P E",65,100);
  ctx.font="22px monospace";ctx.fillStyle="#9db4bb";ctx.fillText("Т И Х И Й   М А Я К",65,147);
  const people=choice==="people";
  ctx.strokeStyle=people?"#9ce1d0":"#ffbd83";
  ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=4;
  if (people) {
    // Six illuminated windows are the passenger manifest.
    for(let i=0;i<6;i++) {const x=67+i*41;ctx.fillRect(x,732,20,39);ctx.globalAlpha=.16;ctx.fillRect(x-5,726,30,51);ctx.globalAlpha=1;}
  } else {
    for (let i=0;i<4;i++) {ctx.beginPath();ctx.arc(74,766,12+i*20,-1.09,-.11);ctx.stroke();}
    ctx.beginPath();ctx.arc(74,766,6,0,2*Math.PI);ctx.fill();
  }
  ctx.font="bold 85px sans-serif";ctx.fillStyle="#fff5df";ctx.fillText(m.title,61,902,965);
  ctx.font="36px sans-serif";ctx.fillStyle="#c9d6d7";ctx.fillText(m.line,65,976,955);
  ctx.strokeStyle="#31424c";ctx.lineWidth=2;line(ctx,65,1050,1012,1050);
  ctx.fillStyle="#a8c6c7";ctx.font="24px monospace";ctx.fillText(m.tag,65,1115,950);
  ctx.strokeStyle=people?"#80d6c2":"#ffbd83";ctx.lineWidth=3;
  ctx.beginPath();
  for(let x=0;x<945;x+=2){
    const p=(x/280)%1;
    let volume=Math.exp(-Math.pow((p-.12)/.045,2))+Math.exp(-Math.pow((p-.32)/.047,2))+1.4*Math.exp(-Math.pow((p-.70)/(people?.11:.19),4));
    if(people) volume+=.4*Math.exp(-Math.pow((p-.89)/.047,2));
    const y=1210+Math.sin(x/4.4)*volume*22;
    if (x===0) ctx.moveTo(x+65,y);else ctx.lineTo(x+65,y);
  }
  ctx.stroke();
  let blob;
  try { blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png")); }
  catch { throw new Error("Cannot export flight log"); }
  if (!blob) throw new Error("No image data");
  return new File([blob],"Orbit-Escape-"+m.file+".png",{type:"image/png"});
}

export function preparePostcard(choice) {
  if (!cached || cached.choice!==choice) {
    const pending=makeFile(choice);
    cached={choice,pending};
    pending.catch(()=>{if(cached?.pending===pending) cached=null;});
  }
  return cached.pending;
}

function nativePlugin() {
  return globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor.Plugins?.OrbitPostcard;
}
function encode(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
export async function savePostcard(choice) {
  const file=await preparePostcard(choice);
  const plugin=nativePlugin();
  if (plugin) {
    const result=await plugin.save({data:await encode(file),name:file.name});
    return result.saved;
  }
  const url=URL.createObjectURL(file), link=document.createElement("a");
  link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return true;
}
export async function sharePostcard(choice) {
  const plugin=nativePlugin();
  if (!plugin && !navigator.canShare) return false;
  try {
    const file=await preparePostcard(choice);
    const title="Orbit Escape · "+memories[choice].title;
    if (plugin) {await plugin.share({data:await encode(file),name:file.name,title});return true;}
    if (!navigator.canShare({files:[file]})) return false;
    await navigator.share({title,files:[file]});
    return true;
  } catch(error) {return error?.name==="AbortError";}
}
