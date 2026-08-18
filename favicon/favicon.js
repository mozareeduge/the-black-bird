(function(){
  "use strict";
  const doc = document;
  function linkEl(){
    let link = doc.getElementById("dynamic-favicon");
    if(!link){
      link = doc.createElement("link");
      link.id = "dynamic-favicon";
      link.rel = "icon";
      link.type = "image/png";
      doc.head.appendChild(link);
    }
    return link;
  }
  function svgToDataURL(svg){ return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg); }

  function line(x1,y1,x2,y2,stroke,w=2,op=1){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`}
  function circ(x,y,r,fill,stroke="none",sw=0,op=1){return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`}
  function wrap(inner,bg){return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="5" fill="${bg}"/>${inner}</svg>`}
  function icon(t){
    const bg="#070706",fg="#e4dbc9",accent="#c49a45",cold="#839cac";
    const pts=[[17,43],[31,18],[48,38]];
    const phase=(t*3)%3, active=Math.floor(phase), next=(active+1)%3;
    const ring=6.2+1.4*Math.sin(t*2*Math.PI);
    let g='';
    g+=circ(pts[0][0],pts[0][1],4.9,bg,fg,1,.82);
    g+=circ(pts[1][0],pts[1][1],4.9,bg,fg,1,.82);
    g+=circ(pts[2][0],pts[2][1],4.9,bg,fg,1,.82);
    g+=circ(pts[active][0],pts[active][1],ring,bg,accent,2.1,.95);
    g+=line(pts[active][0],pts[active][1],pts[next][0],pts[next][1],bg,6,1);
    g+=line(pts[active][0],pts[active][1],pts[next][0],pts[next][1],fg,1.1,.62);
    g+=line(pts[next][0],pts[next][1],pts[(next+1)%3][0],pts[(next+1)%3][1],cold,.9,.18);
    return wrap(g,bg);
  }
  const state={playing:true,speed:2.5,t:0,tick:0,timer:null,stepSize:.0625};
  function intervalMs(){return Math.max(55,Math.round(450/state.speed))}
  function render(){const svg=icon(state.t);linkEl().href=svgToDataURL(svg);window.dispatchEvent(new CustomEvent("mozare-favicon-frame",{detail:{...state,svg}}))}
  function step(){state.t=(state.t+state.stepSize)%1;state.tick++;render()}
  function stop(){if(state.timer!==null){clearInterval(state.timer);state.timer=null}}
  function start(){stop();if(!state.playing)return;state.timer=setInterval(step,intervalMs())}
  function play(){state.playing=true;start()} function pause(){state.playing=false;stop()}
  function setSpeed(v){state.speed=Number(v);if(state.playing)start()}
  function reset(){state.t=0;state.tick=0;render();if(state.playing)start()}
  window.MozareFavicon={state,play,pause,step:()=>{pause();step()},reset,setSpeed,render};
  doc.addEventListener("visibilitychange",()=>{if(doc.visibilityState==="visible"&&state.playing)start()});
  render();start();
})();
