(()=>{
 const root=document.getElementById('yl-track'),svg=root.querySelector('svg');
 const data=window.YANGLIU_DATA;
 const palette={'泛綠':'var(--green)','泛藍':'var(--blue)'};
 const fmt=n=>n.toLocaleString('zh-TW');
 let selection={camp:'泛綠',period:'after'};
 function node(name,attrs,t,parent=svg){
   const el=document.createElementNS('http://www.w3.org/2000/svg',name);
   Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
   if(t!==undefined)el.textContent=t;
   parent.append(el);return el;
 }
 function choose(camp,period){
   selection={camp,period};
   const p=data.camps[camp][period];
   const total=key=>Object.values(data.camps).reduce((a,v)=>a+v[period][key],0);
   const share=k=>(100*p[k]/total(k)).toFixed(1)+'%';
   const box=root.querySelector('.yt-inspect');
   box.style.setProperty('--ink',palette[camp]);box.replaceChildren();
   const title=document.createElement('strong');title.textContent=camp+'社群 · '+(period==='before'?'9/28–9/29 曝光前':'9/30–10/1 曝光後');
   const values=document.createElement('span');values.textContent='發文 '+fmt(p.posts)+' 篇（占兩方 '+share('posts')+'）　聲量 '+fmt(p.buzz)+' 則（占兩方 '+share('buzz')+'）';
   box.append(title,values);
   for(const b of svg.querySelectorAll('[data-point]')){
     const on=b.dataset.point===camp+period;
     b.setAttribute('aria-pressed',String(on));b.querySelector('[data-ring]').setAttribute('opacity',on?'0.7':'0');
   }
 }
 function draw(){
   const w=Math.max(260,Math.round(root.getBoundingClientRect().width)),h=w<440?295:310;
   const left=46,right=w-20,top=32,bottom=h-48;
   const x=n=>left+(right-left)*n/7000,y=n=>bottom-(bottom-top)*n/200000;
   svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.replaceChildren();
   const text=(a,b,s,anchor='middle',ink='var(--muted-foreground)')=>node('text',{x:a,y:b,'text-anchor':anchor,fill:ink,'font-size':12,'font-family':'inherit'},s);
   const line=(x1,y1,x2,y2,color,width=1)=>node('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width});
   text(left,17,'討論聲量（則）','start','var(--foreground)');
   for(const n of [0,50000,100000,150000,200000]){
     line(left,y(n),right,y(n),'var(--border)');text(left-5,y(n)+4,n===0?'0':(n/10000)+'萬','end');
   }
   for(const n of [0,2000,4000,6000]){
     line(x(n),bottom,x(n),bottom+4,'var(--muted-foreground)');text(x(n),bottom+17,fmt(n));
   }
   text((left+right)/2,h-6,'兩日發文數（篇）','middle','var(--foreground)');
   for(const [camp,periods] of Object.entries(data.camps)){
     const a=periods.before,b=periods.after,ink=palette[camp];
     const ax=x(a.posts),ay=y(a.buzz),bx=x(b.posts),by=y(b.buzz);
     line(ax,ay,bx,by,ink,2.8);
     const angle=Math.atan2(by-ay,bx-ax),dx=Math.cos(angle),dy=Math.sin(angle);
     const tx=bx-8*dx,ty=by-8*dy;
     node('path',{d:'M'+tx+' '+ty+'l'+(-10*dx+4*dy)+' '+(-10*dy-4*dx)+'l'+(-8*dy)+' '+(8*dx)+'Z',fill:ink});
     text(bx,by-14,camp+'社群',camp==='泛藍'?'end':'middle',ink);
     for(const [period,p] of Object.entries(periods)){
       const cx=x(p.posts),cy=y(p.buzz);
       const g=node('g',{role:'button',tabindex:0,'data-point':camp+period,'aria-label':camp+'，'+(period==='before'?'曝光前':'曝光後')+'，發文 '+fmt(p.posts)+' 篇，聲量 '+fmt(p.buzz)+' 則'});
       node('circle',{cx,cy,r:13,fill:'transparent'},undefined,g);
       node('circle',{cx,cy,r:9,stroke:ink,fill:'none','data-ring':'','stroke-width':1},undefined,g);
       node('circle',{cx,cy,r:5,stroke:ink,fill:period==='before'?'var(--background)':ink,'stroke-width':2.5},undefined,g);
       g.addEventListener('click',()=>choose(camp,period));
       g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(camp,period)}});
     }
   }
   choose(selection.camp,selection.period);
 }
 for(const p of data.people){
   const row=document.createElement('div'),n=Math.round(20*p.pn);
   const name=document.createElement('span');name.textContent=p.name;
   const marks=document.createElement('b');marks.setAttribute('aria-hidden','true');marks.textContent='＋'.repeat(n);marks.style.setProperty('--ink',palette[p.camp]);
   const value=document.createElement('small');value.textContent='約 '+n+' 份正面 · P/N '+p.pn.toFixed(2)+' · 相關聲量 '+fmt(p.buzz)+' 則';
   row.append(name,marks,value);root.querySelector('.yt-pairs').append(row);
 }
 new ResizeObserver(draw).observe(root.querySelector('.yt-plot'));draw();
})();
