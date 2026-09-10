import { validateComparisonSnapshot } from './comparison-file.js';

export function portableComparisonDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `payloaddiff-comparison-${stamp}.html`;
}

export function createPortableComparisonHtml(snapshot) {
  validateComparisonSnapshot(snapshot);
  const embedded = escapeEmbeddedJson(JSON.stringify(snapshot));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PayloadDiff Saved Comparison</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e5e7eb;background:#0b1020;color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e5e7eb}button,textarea{font:inherit;color:inherit}.app{padding:18px;max-width:1900px;margin:0 auto}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.brand h1{margin:0;font-size:24px}.brand p{margin:5px 0 0;color:#94a3b8;font-size:13px}.pill{display:inline-block;margin-left:9px;padding:3px 8px;border:1px solid #28503e;border-radius:999px;background:#10291f;color:#86efac;font-size:10px;font-weight:700}.card{background:#10182b;border:1px solid #24304a;border-radius:11px}.summary{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 12px;margin-bottom:12px}.counts{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px}.addedText{color:#86efac}.removedText{color:#fca5a5}.modifiedText{color:#fcd34d}.nav{display:flex;gap:8px;align-items:center;white-space:nowrap}button{border:1px solid #33415f;background:#172139;border-radius:7px;padding:7px 10px;cursor:pointer;font-weight:650;font-size:12px}button:hover:not(:disabled){background:#202c47;border-color:#62708f}button:disabled{opacity:.45;cursor:default}.workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.pane{min-width:0;overflow:clip}.paneHead{padding:10px 12px;border-bottom:1px solid #24304a}.paneHead strong{font-size:14px}.paneHead span{display:block;margin-top:3px;color:#8290ab;font-size:10px}.tabs{padding:6px 9px;border-bottom:1px solid #24304a;display:flex;gap:4px}.tabs button{padding:5px 10px;background:#0b1221}.tabs button.active{background:#25375f;border-color:#5575a9}.viewport{height:calc(100vh - 230px);min-height:430px;position:relative;background:#0b1221}.codeScroll,.treeScroll{position:absolute;inset:0;overflow:auto;background:#0b1221}.codeEditor{display:block;width:100%;height:100%;resize:none;overflow:auto;border:0;outline:0;background:transparent;color:#e5edf9;padding:14px 14px 14px 78px;white-space:pre;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:13px;line-height:22px;tab-size:2;caret-color:#e5edf9;position:relative;z-index:2}.overlay{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none}.band{position:absolute;left:0;right:0;height:22px;border-left:5px solid transparent}.band.modified{background:rgba(245,158,11,.28);border-left-color:#fbbf24}.band.added{background:rgba(34,197,94,.28);border-left-color:#4ade80}.band.removed{background:rgba(239,68,68,.28);border-left-color:#f87171}.band.current{outline:2px solid rgba(96,165,250,.98);outline-offset:-2px}.gutter{position:absolute;z-index:5;left:0;top:0;bottom:0;width:64px;overflow:hidden;pointer-events:none;background:#0b1221;border-right:1px solid #253149}.gutterRow{position:absolute;left:0;right:0;padding-right:10px;text-align:right;color:#71809d;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:12px;line-height:22px;height:22px}.treeScroll{padding:8px 0 22px;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:13px}.treeRow{min-width:max-content;height:25px;display:flex;align-items:center;padding-left:calc(10px + var(--depth)*18px);padding-right:14px;border-left:4px solid transparent}.treeRow.modified{background:rgba(245,158,11,.22);border-left-color:#fbbf24}.treeRow.added{background:rgba(34,197,94,.22);border-left-color:#4ade80}.treeRow.removed{background:rgba(239,68,68,.22);border-left-color:#f87171}.treeRow.branch{border-left-color:#51617d}.treeToggle{width:22px;height:22px;padding:0;border:0;background:transparent;color:#91a1bf}.treeKey{color:#8fc2ff;margin-right:10px}.treeValue{color:#9aa7bd}.treeValue.string{color:#a7f3d0}.treeValue.number{color:#f9c97b}.treeValue.boolean{color:#c4b5fd}.hidden{display:none!important}.status{color:#9aa9c5;font-size:11px}.status.error{color:#fca5a5}.note{margin-top:10px;color:#64748b;font-size:10px;text-align:center}.invalid{box-shadow:inset 0 0 0 1px rgba(248,113,113,.8)}.codeEditor,.treeScroll{scrollbar-width:auto;scrollbar-color:#647896 #08101d}.codeEditor::-webkit-scrollbar,.treeScroll::-webkit-scrollbar{width:14px;height:14px}.codeEditor::-webkit-scrollbar-track,.treeScroll::-webkit-scrollbar-track{background:#08101d}.codeEditor::-webkit-scrollbar-thumb,.treeScroll::-webkit-scrollbar-thumb{background:#647896;border:3px solid #08101d;border-radius:999px}.codeEditor::-webkit-scrollbar-thumb:hover,.treeScroll::-webkit-scrollbar-thumb:hover{background:#8aa0c2}
@media(max-width:900px){.workspace{grid-template-columns:1fr}.viewport{height:55vh}.summary,.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="app">
  <div class="top">
    <div class="brand"><h1>PayloadDiff <span class="pill">Saved browser comparison</span></h1><p id="savedMeta">Portable comparison file</p></div>
    <div id="status" class="status">Ready</div>
  </div>
  <section class="summary card">
    <div id="counts" class="counts"></div>
    <div class="nav"><button id="prev">← Previous</button><strong id="position">0 of 0</strong><button id="next">Next →</button></div>
  </section>
  <main class="workspace">
    <section class="pane card" data-pane="0"><div class="paneHead"><strong>File 1</strong><span id="meta0"></span></div><div class="tabs"><button data-view="code" class="active">Code</button><button data-view="tree" class="treeTab">Tree</button></div><div class="viewport"><div class="overlay"></div><div class="gutter"></div><textarea class="codeEditor" spellcheck="false" wrap="off"></textarea><div class="treeScroll hidden"></div></div></section>
    <section class="pane card" data-pane="1"><div class="paneHead"><strong>File 2</strong><span id="meta1"></span></div><div class="tabs"><button data-view="code" class="active">Code</button><button data-view="tree" class="treeTab">Tree</button></div><div class="viewport"><div class="overlay"></div><div class="gutter"></div><textarea class="codeEditor" spellcheck="false" wrap="off"></textarea><div class="treeScroll hidden"></div></div></section>
  </main>
  <div class="note">This HTML file contains both saved payloads and runs locally in your browser. Nothing is uploaded by this file.</div>
</div>
<script id="payloaddiff-snapshot" type="application/json">${embedded}</script>
<script>
(function(){
'use strict';
var snapshot=JSON.parse(document.getElementById('payloaddiff-snapshot').textContent);
var panes=Array.from(document.querySelectorAll('.pane'));
var editors=Array.from(document.querySelectorAll('.codeEditor'));
var trees=Array.from(document.querySelectorAll('.treeScroll'));
var overlays=Array.from(document.querySelectorAll('.overlay'));
var gutters=Array.from(document.querySelectorAll('.gutter'));
var counts=document.getElementById('counts');
var position=document.getElementById('position');
var prev=document.getElementById('prev');
var next=document.getElementById('next');
var status=document.getElementById('status');
var ordered=[];
var lineTypes=[[],[]];
var lineIndex=[[],[]];
var parsed=[null,null];
var current=0;
var syncLock=false;
var editTimer=0;
var mode=snapshot.mode;
var exact=new Map();
var ancestors=new Set();
var summary={added:0,removed:0,modified:0};

editors[0].value=snapshot.payloads.left;
editors[1].value=snapshot.payloads.right;
document.getElementById('savedMeta').textContent=(mode.toUpperCase())+' comparison saved '+(snapshot.createdAt||'');
document.getElementById('meta0').textContent=lineCount(editors[0].value).toLocaleString()+' lines';
document.getElementById('meta1').textContent=lineCount(editors[1].value).toLocaleString()+' lines';
if(mode!=='json') Array.from(document.querySelectorAll('.treeTab')).forEach(function(b){b.classList.add('hidden');});

editors.forEach(function(editor,index){
  editor.addEventListener('scroll',function(){renderCode(index);syncScroll(index,editor);syncNavigator(index);},{passive:true});
  editor.addEventListener('click',function(e){selectFromClick(index,e);});
  editor.addEventListener('input',function(){
    document.getElementById('meta'+index).textContent=lineCount(editor.value).toLocaleString()+' lines';
    clearTimeout(editTimer);
    status.textContent='Editing…';status.classList.remove('error');
    editTimer=setTimeout(recompare,220);
  });
});
trees.forEach(function(tree,index){tree.addEventListener('scroll',function(){syncScroll(index,tree);},{passive:true});});
Array.from(document.querySelectorAll('.tabs')).forEach(function(tab,index){tab.addEventListener('click',function(e){var b=e.target.closest('button[data-view]');if(b)switchView(index,b.dataset.view,true);});});
prev.addEventListener('click',function(){move(-1);});next.addEventListener('click',function(){move(1);});
window.addEventListener('resize',function(){renderAllCode();});

recompare(true);

function recompare(initial){
  try{
    panes.forEach(function(p){p.classList.remove('invalid');});
    if(mode==='json') compareJson(); else compareXml();
    current=Math.min(initial?(snapshot.ui&&snapshot.ui.currentDiffIndex||0):current,Math.max(0,ordered.length-1));
    buildIndexes();renderSummary();renderAllCode();renderTrees();
    if(initial)restoreUi();
    status.textContent=ordered.length?'Comparison ready':'No differences';status.classList.remove('error');
  }catch(error){
    status.textContent=error.message||'Unable to compare';status.classList.add('error');
    overlays.forEach(function(o){o.replaceChildren();});prev.disabled=true;next.disabled=true;
  }
}

function compareJson(){
  var left=parseJson(editors[0].value),right=parseJson(editors[1].value);parsed=[left,right];
  var diffs=[];summary={added:0,removed:0,modified:0};walk(left,right,'$',diffs);
  var leftMap=buildLineMap(left),rightMap=buildLineMap(right);
  ordered=diffs.map(function(d){return {path:d.path,type:d.type,leftLine:d.type==='added'?null:(leftMap.get(d.path)||null),rightLine:d.type==='removed'?null:(rightMap.get(d.path)||null)};});
  exact=new Map();ancestors=new Set();ordered.forEach(function(d){exact.set(d.path,d.type);var a=pathAncestors(d.path);for(var i=0;i<a.length-1;i++)ancestors.add(a[i]);});
}

function compareXml(){
  parsed=[null,null];exact=new Map();ancestors=new Set();
  var a=editors[0].value.split('\n'),b=editors[1].value.split('\n');var d=myersChangedLines(a,b);var n=Math.max(d.leftChanged.length,d.rightChanged.length);ordered=[];summary={added:0,removed:0,modified:0};
  for(var i=0;i<n;i++){var l=d.leftChanged[i]||null,r=d.rightChanged[i]||null,t=l&&r?'modified':l?'removed':'added';ordered.push({path:'$xml['+i+']',type:t,leftLine:l,rightLine:r});summary[t]++;}
}

function walk(left,right,path,diffs){
  if(Object.is(left,right))return;var lt=typeOf(left),rt=typeOf(right);if(lt!==rt){diffs.push({path:path,type:'modified'});summary.modified++;return;}
  if(lt==='array'){var max=Math.max(left.length,right.length);for(var i=0;i<max;i++){var p=path+'['+i+']';if(i>=left.length){diffs.push({path:p,type:'added'});summary.added++;}else if(i>=right.length){diffs.push({path:p,type:'removed'});summary.removed++;}else walk(left[i],right[i],p,diffs);}return;}
  if(lt==='object'){var lk=Object.keys(left),rk=Object.keys(right),rs=new Set(rk),ls=new Set(lk);lk.forEach(function(k){var p=joinPath(path,k);if(!rs.has(k)){diffs.push({path:p,type:'removed'});summary.removed++;}else walk(left[k],right[k],p,diffs);});rk.forEach(function(k){if(!ls.has(k)){diffs.push({path:joinPath(path,k),type:'added'});summary.added++;}});return;}
  diffs.push({path:path,type:'modified'});summary.modified++;
}

function buildLineMap(value){var found=new Map(),line={v:1};visitLines(value,'$',found,line);return found;}
function visitLines(value,path,found,line){found.set(path,line.v);var t=typeOf(value);if(t!=='object'&&t!=='array'){line.v++;return;}if(t==='array'){if(!value.length){line.v++;return;}line.v++;for(var i=0;i<value.length;i++)visitLines(value[i],path+'['+i+']',found,line);line.v++;return;}var keys=Object.keys(value);if(!keys.length){line.v++;return;}line.v++;keys.forEach(function(k){visitLines(value[k],joinPath(path,k),found,line);});line.v++;}
function joinPath(path,key){return /^[A-Za-z_$][\\w$]*$/.test(key)?path+'.'+key:path+'['+JSON.stringify(String(key))+']';}
function typeOf(v){if(v===null)return'null';if(Array.isArray(v))return'array';return typeof v==='object'?'object':typeof v;}
function parseJson(text){var v=JSON.parse(text);if(typeof v==='string'&&(v.trim().startsWith('{')||v.trim().startsWith('[')))v=JSON.parse(v);return v;}

function buildIndexes(){lineTypes=[[],[]];lineIndex=[[],[]];for(var i=0;i<ordered.length;i++){var d=ordered[i];for(var side=0;side<2;side++){var line=side===0?d.leftLine:d.rightLine;var fallback=side===0?d.rightLine:d.leftLine;if(lineIndex[side]&& (line||fallback))lineIndex[side].push({line:line||fallback,index:i});if(!line)continue;if(d.type==='added'&&side===0)continue;if(d.type==='removed'&&side===1)continue;lineTypes[side].push({line:line,type:d.type,index:i});}}lineIndex.forEach(function(x){x.sort(function(a,b){return a.line-b.line||a.index-b.index;});});lineTypes.forEach(function(x){x.sort(function(a,b){return a.line-b.line;});});}
function renderSummary(){var total=summary.added+summary.removed+summary.modified;counts.innerHTML='<strong>'+total+' changes</strong><span class="addedText">+'+summary.added+' added</span><span class="removedText">−'+summary.removed+' removed</span><span class="modifiedText">~'+summary.modified+' modified</span>';updateNav();}
function updateNav(){position.textContent=ordered.length?(current+1)+' of '+ordered.length:'0 of 0';prev.disabled=!ordered.length;next.disabled=!ordered.length;}
function move(delta){if(!ordered.length)return;current=(current+delta+ordered.length)%ordered.length;updateNav();renderAllCode();if(activeView(0)==='tree')revealTree(0,ordered[current].path);if(activeView(1)==='tree')revealTree(1,ordered[current].path);if(activeView(0)==='code'||activeView(1)==='code')scrollToCurrent();}
function scrollToCurrent(){var d=ordered[current];if(!d)return;[0,1].forEach(function(side){var line=side===0?(d.leftLine||d.rightLine):(d.rightLine||d.leftLine);if(!line)return;var e=editors[side];e.scrollTop=Math.max(0,(line-1)*22-e.clientHeight*.42);});renderAllCode();}
function nearest(entries,line){if(!entries.length)return-1;if(line<=entries[0].line)return entries[0].index;var last=entries[entries.length-1];if(line>=last.line)return last.index;var lo=0,hi=entries.length-1;while(lo<hi){var mid=(lo+hi)>>1;if(entries[mid].line<line)lo=mid+1;else hi=mid;}var a=entries[lo],b=entries[Math.max(0,lo-1)];return Math.abs(line-b.line)<=Math.abs(a.line-line)?b.index:a.index;}
function syncNavigator(side){var e=editors[side],line=Math.max(1,Math.round((e.scrollTop+e.clientHeight/2)/22)+1),n=nearest(lineIndex[side],line);if(n>=0&&n!==current){current=n;updateNav();renderAllCode();}}
function selectFromClick(side,event){var e=editors[side],r=e.getBoundingClientRect(),line=Math.max(1,Math.floor((event.clientY-r.top+e.scrollTop-14)/22)+1),n=nearest(lineIndex[side],line);if(n>=0&&n!==current){current=n;updateNav();renderAllCode();}}

function renderAllCode(){renderCode(0);renderCode(1);}
function renderCode(side){var e=editors[side],o=overlays[side],g=gutters[side];if(activeView(side)!=='code'){o.replaceChildren();g.replaceChildren();return;}var first=Math.max(1,Math.floor((e.scrollTop-14)/22)+1),last=Math.ceil((e.scrollTop+e.clientHeight-14)/22)+2,frag=document.createDocumentFragment();for(var line=first-4;line<=last+4;line++){if(line<1)continue;var n=document.createElement('div');n.className='gutterRow';n.textContent=line.toLocaleString();n.style.top=(14+(line-1)*22-e.scrollTop)+'px';g.appendChild(n);}while(g.children.length>last-first+12)g.removeChild(g.firstChild);var bf=document.createDocumentFragment();var cur=ordered[current];var curLine=side===0?(cur&&cur.leftLine):(cur&&cur.rightLine);lineTypes[side].forEach(function(x){if(x.line<first-2||x.line>last+2)return;var b=document.createElement('div');b.className='band '+x.type+(x.line===curLine?' current':'');b.style.top=(14+(x.line-1)*22-e.scrollTop)+'px';bf.appendChild(b);});o.replaceChildren(bf);}

function syncScroll(sourceSide,source){if(syncLock)return;var target=source===editors[sourceSide]?editors[1-sourceSide]:trees[1-sourceSide];if(!target||target.classList.contains('hidden'))return;syncLock=true;var maxS=Math.max(0,source.scrollHeight-source.clientHeight),maxT=Math.max(0,target.scrollHeight-target.clientHeight);target.scrollTop=maxS?source.scrollTop/maxS*maxT:0;target.scrollLeft=source.scrollLeft;requestAnimationFrame(function(){syncLock=false;});}

function switchView(side,view,mirror){if(view==='tree'&&mode!=='json')return;panes[side].querySelectorAll('.tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.view===view);});editors[side].classList.toggle('hidden',view!=='code');overlays[side].classList.toggle('hidden',view!=='code');gutters[side].classList.toggle('hidden',view!=='code');trees[side].classList.toggle('hidden',view!=='tree');if(view==='tree')renderTree(side);else renderCode(side);if(mirror)switchView(1-side,view,false);}
function activeView(side){return panes[side].querySelector('.tabs button[data-view="tree"]').classList.contains('active')?'tree':'code';}
function renderTrees(){if(mode!=='json')return;if(activeView(0)==='tree')renderTree(0);if(activeView(1)==='tree')renderTree(1);}
function renderTree(side){var tree=trees[side];tree.replaceChildren();if(parsed[side]==null)return;appendTree(tree,'$',parsed[side],'$',0,side,true);}
function appendTree(parent,key,value,path,depth,side,expanded){var t=typeOf(value),container=t==='object'||t==='array';var row=document.createElement('div');var cls=treeClass(path,side);row.className='treeRow '+cls;row.style.setProperty('--depth',depth);row.dataset.path=path;var toggle=document.createElement('button');toggle.className='treeToggle';toggle.textContent=container?(expanded?'▾':'▸'):'';toggle.disabled=!container;var k=document.createElement('span');k.className='treeKey';k.textContent=key;var v=document.createElement('span');v.className='treeValue '+t;v.textContent=container?(t==='array'?'Array('+value.length+')':'Object('+Object.keys(value).length+')'):(typeof value==='string'?JSON.stringify(value):String(value));row.append(toggle,k,v);parent.appendChild(row);if(container){var children=document.createElement('div');parent.appendChild(children);if(expanded)buildChildren(children,value,path,depth+1,side);toggle.addEventListener('click',function(){var open=toggle.textContent==='▾';toggle.textContent=open?'▸':'▾';children.replaceChildren();if(!open)buildChildren(children,value,path,depth+1,side);});}}
function buildChildren(parent,value,path,depth,side){if(Array.isArray(value)){for(var i=0;i<value.length;i++)appendTree(parent,'['+i+']',value[i],path+'['+i+']',depth,side,false);}else Object.keys(value).forEach(function(k){appendTree(parent,k,value[k],joinPath(path,k),depth,side,false);});}
function treeClass(path,side){var t=exact.get(path);if(t){if(t==='added')return side===1?'added':'branch';if(t==='removed')return side===0?'removed':'branch';return'modified';}return ancestors.has(path)?'branch':'';}
function pathAncestors(path){var out=['$'];if(path==='$')return out;var tokens=path.slice(1).match(/\.[A-Za-z_$][\\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g)||[];var cur='$';tokens.forEach(function(t){cur+=t;out.push(cur);});return out;}
function findTreeRow(side,path){return Array.from(trees[side].querySelectorAll('.treeRow[data-path]')).find(function(r){return r.dataset.path===path;})||null;}
function revealTree(side,path){var chain=pathAncestors(path);for(var i=0;i<chain.length-1;i++){var row=findTreeRow(side,chain[i]);if(!row)continue;var toggle=row.querySelector('.treeToggle');if(toggle&&toggle.textContent==='▸')toggle.click();}requestAnimationFrame(function(){var row=findTreeRow(side,path);if(row)row.scrollIntoView({block:'center'});});}

function restoreUi(){var ui=snapshot.ui||{};var views=ui.views||['code','code'];switchView(0,views[0]==='tree'?'tree':'code',false);switchView(1,views[1]==='tree'?'tree':'code',false);requestAnimationFrame(function(){var cs=ui.codeScroll||[];var ts=ui.treeScroll||[];[0,1].forEach(function(i){if(cs[i]){editors[i].scrollTop=cs[i].top||0;editors[i].scrollLeft=cs[i].left||0;}if(ts[i]){trees[i].scrollTop=ts[i].top||0;trees[i].scrollLeft=ts[i].left||0;}});renderAllCode();});}
function lineCount(s){if(!s)return 0;return s.split('\n').length;}
function range(start,count){var out=[];for(var i=0;i<count;i++)out.push(start+i);return out;}
function myersChangedLines(a,b){var n=a.length,m=b.length,prefix=0;while(prefix<n&&prefix<m&&a[prefix]===b[prefix])prefix++;var suffix=0;while(suffix<n-prefix&&suffix<m-prefix&&a[n-1-suffix]===b[m-1-suffix])suffix++;var aa=a.slice(prefix,n-suffix),bb=b.slice(prefix,m-suffix);if(!aa.length&&!bb.length)return{leftChanged:[],rightChanged:[]};if(!aa.length)return{leftChanged:[],rightChanged:range(prefix+1,bb.length)};if(!bb.length)return{leftChanged:range(prefix+1,aa.length),rightChanged:[]};var max=aa.length+bb.length,maxD=Math.min(max,4000),offset=maxD+1,v=new Int32Array(offset*2+3);v.fill(-1);v[offset+1]=0;var trace=[],endD=-1;outer:for(var d=0;d<=maxD;d++){trace.push(new Int32Array(v));for(var k=-d;k<=d;k+=2){var idx=offset+k,x;if(k===-d||(k!==d&&v[idx-1]<v[idx+1]))x=v[idx+1];else x=v[idx-1]+1;var y=x-k;while(x<aa.length&&y<bb.length&&aa[x]===bb[y]){x++;y++;}v[idx]=x;if(x>=aa.length&&y>=bb.length){endD=d;break outer;}}}if(endD<0)return{leftChanged:range(prefix+1,aa.length),rightChanged:range(prefix+1,bb.length)};var x=aa.length,y=bb.length,leftChanged=[],rightChanged=[];for(var d=endD;d>0;d--){var pv=trace[d-1],k=x-y,pk;if(k===-d||(k!==d&&pv[offset+k-1]<pv[offset+k+1]))pk=k+1;else pk=k-1;var px=pv[offset+pk],py=px-pk;while(x>px&&y>py){x--;y--;}if(x===px){y--;rightChanged.push(prefix+y+1);}else{x--;leftChanged.push(prefix+x+1);}}leftChanged.reverse();rightChanged.reverse();return{leftChanged:leftChanged,rightChanged:rightChanged};}
})();
</script>
</body>
</html>`;
}

export function parsePortableComparisonHtml(text) {
  const match = String(text).match(/<script\s+id=["']payloaddiff-snapshot["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('This HTML file does not contain a PayloadDiff saved comparison.');
  let snapshot;
  try {
    snapshot = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Invalid PayloadDiff browser comparison: ${error?.message || 'invalid embedded data'}`);
  }
  validateComparisonSnapshot(snapshot);
  return snapshot;
}

function escapeEmbeddedJson(text) {
  return text
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
