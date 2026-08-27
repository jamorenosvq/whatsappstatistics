let pyodide = null;
let analysis = null;
let chatText = null;
let excelArrayBuffer = null;


const chatFile = document.getElementById('chatFile');
const excelFile = document.getElementById('excelFile');
const runBtn = document.getElementById('runBtn');
const statusEl = document.getElementById('status');
const progress = document.querySelector('#progress');
const progressBar = progress.querySelector('div');

chatFile.addEventListener('change', async () => {
  const f = chatFile.files[0];
  if (!f) return;
  chatText = await f.text();
  runBtn.disabled = false;
  statusEl.textContent = `${f.name} cargado (${(f.size/1024/1024).toFixed(2)} MB).`;
});
excelFile.addEventListener('change', async () => {
  const f = excelFile.files[0];
  excelArrayBuffer = f ? await f.arrayBuffer() : null;
});

async function initPyodide(){
  if(pyodide) return;
  statusEl.textContent = 'Cargando Python en el navegador…';
  pyodide = await loadPyodide();
  statusEl.textContent = 'Python listo. Selecciona el chat y pulsa «Analizar chat».';
}
initPyodide().catch(e => statusEl.textContent = 'No se pudo cargar Python: '+e);

runBtn.addEventListener('click', runAnalysis);

async function runAnalysis(){
  if(!chatText || !pyodide) return;
  runBtn.disabled = true;
  progress.style.display='block'; progressBar.style.width='10%';
  statusEl.textContent='Analizando el chat…';

  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  const python = getPythonAnalysis();

  try{
    pyodide.globals.set('CHAT_TEXT', chatText);
    pyodide.globals.set('START_DATE', start);
    pyodide.globals.set('END_DATE', end);
    progressBar.style.width='30%';
    const result = await pyodide.runPythonAsync(python);
    progressBar.style.width='85%';
    analysis = JSON.parse(result);
    renderAll(analysis);
    progressBar.style.width='100%';
    statusEl.textContent=`Análisis terminado: ${analysis.meta.messages.toLocaleString('es-ES')} mensajes de ${analysis.meta.users} usuarios.`;
    document.getElementById('results').classList.remove('hidden');
  }catch(e){
    console.error(e);
    statusEl.textContent='Error durante el análisis: '+e;
    alert('Se ha producido un error. Abre F12 → Consola para ver los detalles.');
  }finally{
    runBtn.disabled=false;
    setTimeout(()=>progress.style.display='none',500);
  }
}

function getPythonAnalysis(){
return String.raw`
import re, json, math
from collections import Counter, defaultdict
from datetime import datetime

START = START_DATE
END = END_DATE

# Parser compatible con las exportaciones habituales de WhatsApp en español.
patterns = [
    re.compile(r'^\[(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*?):\s(.*)$'),
    re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*?):\s(.*)$'),
    re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*)$')
]

def parse_dt(d,t):
    for fmt in ('%d/%m/%Y %H:%M:%S','%d/%m/%Y %H:%M','%d/%m/%y %H:%M:%S','%d/%m/%y %H:%M'):
        try: return datetime.strptime(d+' '+t,fmt)
        except: pass
    return None

rows=[]
current=None
for line in CHAT_TEXT.replace('\r\n','\n').replace('\r','\n').split('\n'):
    m=None
    for p in patterns:
        m=p.match(line)
        if m: break
    if m:
        if len(m.groups())==4:
            d,t,user,msg=m.groups()
            dt=parse_dt(d,t)
            if dt:
                current={'date':dt,'username':user.strip(),'message':msg}
                rows.append(current)
                continue
        elif len(m.groups())==3:
            d,t,msg=m.groups()
            dt=parse_dt(d,t)
            if dt:
                current={'date':dt,'username':'','message':msg}
                rows.append(current); continue
    if current is not None and line.strip():
        current['message'] += '\n' + line

# Date filtering, equivalent to the user's pandas .between().
rows=[r for r in rows if START <= r['date'].strftime('%Y-%m-%d') <= END and r['username']!='']
rows.sort(key=lambda r:r['date'])

# Ignore system messages that were parsed without a sender when possible.
media_tokens={'<multimedia omitido>','multimedia omitido','<media omitted>','media omitted'}

users=sorted(set(r['username'] for r in rows))
def clean(s):
    s=s.lower()
    s=re.sub(r'[^a-záéíóúüñ]',' ',s)
    return s

# Preprocesamiento lingüístico: stopwords + lematización morfológica conservadora.
stop_words=set("""a al algo alguna algunas alguno algunos ante antes aquel aquella aquellas aquellos aqui aquí asi así como con contra cual cuales cuando de del desde donde dos el él ella ellas ellos en entre era eran eres es esa esas ese eso esos esta estaba estaban estado estas este esto estos fue fueron ha haber habia había han hasta hay he la las le les lo los más me mi mis mucha muchas mucho muchos muy nada ni no nos nosotros o otra otras otro otros para pero por que qué quien quién quienes se sea según si sí sin sobre son su sus también te tenía tienen tiene todo toda todas todos tu tú tus un una unas uno unos usted ustedes y ya yo https www com net org html null omitido multimedia status media p v q d x e u etc""".split())
lemma_map={
"soy":"ser","eres":"ser","es":"ser","somos":"ser","sois":"ser","son":"ser","era":"ser","eras":"ser","éramos":"ser","erais":"ser","eran":"ser","fui":"ser","fuiste":"ser","fue":"ser","fuimos":"ser","fuisteis":"ser","fueron":"ser",
"estoy":"estar","estás":"estar","está":"estar","estamos":"estar","estáis":"estar","están":"estar","estaba":"estar","estabas":"estar","estábamos":"estar","estabais":"estar","estaban":"estar","estuve":"estar","estuviste":"estar","estuvo":"estar","estuvimos":"estar","estuvieron":"estar",
"tengo":"tener","tienes":"tener","tiene":"tener","tenemos":"tener","tenéis":"tener","tienen":"tener","tenía":"tener","tenías":"tener","teníamos":"tener","tenían":"tener","tuve":"tener","tuviste":"tener","tuvo":"tener","tuvimos":"tener","tuvieron":"tener",
"hago":"hacer","haces":"hacer","hace":"hacer","hacemos":"hacer","hacéis":"hacer","hacen":"hacer","hice":"hacer","hiciste":"hacer","hizo":"hacer","hicimos":"hacer","hicieron":"hacer",
"voy":"ir","vas":"ir","va":"ir","vamos":"ir","vais":"ir","van":"ir","iba":"ir","ibas":"ir","íbamos":"ir","ibais":"ir","iban":"ir",
"digo":"decir","dices":"decir","dice":"decir","decimos":"decir","dicen":"decir","dije":"decir","dijo":"decir","dijimos":"decir","dijeron":"decir",
"puedo":"poder","puedes":"poder","puede":"poder","podemos":"poder","pueden":"poder","podía":"poder","podías":"poder","podíamos":"poder","podían":"poder",
"quiero":"querer","quieres":"querer","quiere":"querer","queremos":"querer","quieren":"querer","quería":"querer","querías":"querer","queríamos":"querer","querían":"querer",
"vengo":"venir","vienes":"venir","viene":"venir","venimos":"venir","vienen":"venir","vino":"venir","vinieron":"venir",
"doy":"dar","das":"dar","da":"dar","damos":"dar","dan":"dar","dio":"dar","dieron":"dar",
"sé":"saber","sabes":"saber","sabe":"saber","sabemos":"saber","saben":"saber","sabía":"saber","sabían":"saber",
"veo":"ver","ves":"ver","ve":"ver","vemos":"ver","ven":"ver","vi":"ver","vio":"ver","vieron":"ver"
}
def lemma_word(w):
    if w in lemma_map: return lemma_map[w]
    if len(w)>=8 and w.endswith('amientos'): return w[:-9]+'amiento'
    if len(w)>=8 and w.endswith('imientos'): return w[:-9]+'imiento'
    if len(w)>=7 and w.endswith('aciones'): return w[:-7]+'ación'
    if len(w)>=7 and w.endswith('iciones'): return w[:-7]+'ición'
    if len(w)>=7 and w.endswith(('adores','adoras')): return w[:-7]+'ador'
    if len(w)>=7 and w.endswith('mente'): return w[:-5]
    if len(w)>=6 and w.endswith(('iendo','ando')): return w[:-5 if w.endswith('iendo') else -4]
    if len(w)>=6 and w.endswith('es') and not w.endswith(('ses','ces')): return w[:-2]
    if len(w)>=6 and w.endswith(('os','as')): return w[:-2]
    if len(w)>=5 and w.endswith(('o','a')): return w[:-1]
    return w
def tokens_for(messages):
    out=[]
    for msg in messages:
        for w in clean(str(msg)).split():
            if w in stop_words or len(w)<4: continue
            lw=lemma_word(w)
            if lw not in stop_words and len(lw)>=4: out.append(lw)
    return out
all_tokens=tokens_for([r['message'] for r in rows])
word_counts=Counter(all_tokens)
trigram_counts=Counter(tuple(all_tokens[i:i+3]) for i in range(max(0,len(all_tokens)-2)))
def top_counter(c,n=50):
    return [{'key':(' '.join(k) if isinstance(k,tuple) else k),'count':v} for k,v in Counter(c).most_common(n)]
user_word={}; user_tri={}
for u in users:
    ts=tokens_for([r['message'] for r in rows if r['username']==u])
    user_word[u]=top_counter(Counter(ts),20)
    user_tri[u]=top_counter(Counter(tuple(ts[i:i+3]) for i in range(max(0,len(ts)-2))),15)

# Basic aggregates
user_msg=Counter(r['username'] for r in rows)
day=Counter(r['date'].strftime('%Y-%m-%d') for r in rows)
hour_user=Counter((r['username'],r['date'].hour) for r in rows)
weekday_names=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
weekday_user=Counter((r['username'],weekday_names[r['date'].weekday()]) for r in rows)
chars=Counter()
lengths=defaultdict(list)
for r in rows:
    n=len(r['message'])
    chars[r['username']]+=n
    lengths[r['username']].append(n)

# Daily user time series for non-cumulative/cumulative charts
daily_user=Counter((r['date'].strftime('%Y-%m-%d'),r['username']) for r in rows)
dates=sorted(day)
series_daily=[]
cum_by_user=Counter()
series_cum=[]
for d in dates:
    for u in users:
        v=daily_user[(d,u)]
        series_daily.append({'date':d,'user':u,'value':v})
        cum_by_user[u]+=v
        series_cum.append({'date':d,'user':u,'value':cum_by_user[u]})

# QuestionRandom
question_day=Counter()
question_rows=[]
for r in rows:
    if '#preguntarandom' in r['message'].lower():
        question_day[r['date'].strftime('%Y-%m-%d')]+=1
        question_rows.append({'date':r['date'].strftime('%d/%m/%Y %H:%M'),'user':r['username'],'message':r['message']})

# Boxplot raw data
box=[{'user':u,'lengths':lengths[u]} for u in users]

# Estadísticas especiales
month_counts=Counter(r['date'].strftime('%Y-%m') for r in rows)
month_user=Counter((r['date'].strftime('%Y-%m'),r['username']) for r in rows)
heat=Counter((weekday_names[r['date'].weekday()], r['date'].hour) for r in rows)
participation=[{'user':u,'count':user_msg[u],'pct':round(user_msg[u]/len(rows)*100,2) if rows else 0} for u in users]
avg_words=[]
for u in users:
    msgs=[r['message'] for r in rows if r['username']==u]
    counts=[len(re.findall(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+', clean(m))) for m in msgs]
    avg_words.append({'user':u,'avg':round(sum(counts)/len(counts),2) if counts else 0})
monthly_participation=[]
for month in sorted(month_counts):
    total=month_counts[month]
    for u in users:
        monthly_participation.append({'month':month,'user':u,'count':month_user[(month,u)],'pct':round(month_user[(month,u)]/total*100,2) if total else 0})

emoji_counts=Counter()
for r in rows:
    for e in re.findall(r'[\U0001F300-\U0001FAFF\U00002600-\U000027BF]', r['message']):
        emoji_counts[e]+=1
most_active_day=max(day.items(),key=lambda x:x[1]) if day else ('—',0)
most_active_hour=max(Counter(r['date'].hour for r in rows).items(),key=lambda x:x[1]) if rows else ('—',0)
top_user=max(user_msg.items(),key=lambda x:x[1]) if user_msg else ('—',0)
longest=max(rows,key=lambda r:len(r['message'])) if rows else {'username':'—','message':'','date':None}
user_day=Counter((r['username'],r['date'].strftime('%Y-%m-%d')) for r in rows)
most_user_day=max(user_day.items(),key=lambda x:x[1]) if user_day else (('—','—'),0)
top_tri=max(trigram_counts.items(),key=lambda x:x[1]) if trigram_counts else (('—','—','—'),0)
# Province information can be added later in JS from GR.xlsx.
out={
 'meta': {'messages':len(rows),'users':len(users),
          'first': rows[0]['date'].strftime('%d/%m/%Y %H:%M') if rows else '',
          'last': rows[-1]['date'].strftime('%d/%m/%Y %H:%M') if rows else ''},
 'users':users,
 'user_msg': [{'user':u,'count':user_msg[u]} for u in sorted(users,key=lambda x:(-user_msg[x],x.lower()))],
 'day':[{'date':d,'count':day[d]} for d in dates],
 'hour_user':[{'user':u,'hour':h,'count':hour_user[(u,h)]} for u in users for h in range(24) if hour_user[(u,h)]],
 'weekday_user':[{'user':u,'weekday':w,'count':weekday_user[(u,w)]} for u in users for w in weekday_names if weekday_user[(u,w)]],
 'daily_user':series_daily,
 'daily_cum':series_cum,
 'lengths':box,
 'words':top_counter(word_counts,50),
 'trigrams':top_counter(trigram_counts,50),
 'user_words':user_word,
 'user_trigrams':user_tri,
 'question_day':[{'date':d,'count':question_day[d]} for d in sorted(question_day)],
 'question_rows':question_rows,
 'month_counts':[{'month':d,'count':month_counts[d]} for d in sorted(month_counts)],
 'monthly_participation':monthly_participation,
 'heatmap':[{'weekday':w,'hour':h,'count':heat[(w,h)]} for w in weekday_names for h in range(24)],
 'participation':participation,
 'avg_words':avg_words,
 'emojis':[{'emoji':e,'count':n} for e,n in emoji_counts.most_common(30)],
 'records':{
   'day':[most_active_day[0],most_active_day[1]],
   'hour':[most_active_hour[0],most_active_hour[1]],
   'top_user':[top_user[0],top_user[1]],
   'longest':[longest['username'],len(longest['message'])],
   'user_day':[[most_user_day[0][0],most_user_day[0][1]],most_user_day[1]],
   'trigram':[' '.join(top_tri[0]),top_tri[1]],
   'emoji':[emoji_counts.most_common(1)[0][0],emoji_counts.most_common(1)[0][1]] if emoji_counts else ['—',0],
   'question_random':len(question_rows)
 }
}
json.dumps(out,ensure_ascii=False)
`;
}

function baseLayout(title){
  return {title:{text:title,x:0.02,font:{size:18}},margin:{l:55,r:25,t:55,b:65},paper_bgcolor:'white',plot_bgcolor:'white',hovermode:'x unified'};
}
function plot(id,data,layout,config={}){
  Plotly.newPlot(id,data,layout,{responsive:true,displaylogo:false,modeBarButtonsToRemove:['lasso2d','select2d'],...config});
}
function groupSeries(rows,key,valueKey){
  const m={};
  rows.forEach(r=>{(m[r[key]]??=[]).push(r)});
  return m;
}
function renderAll(a){
  document.getElementById('summary').classList.remove('hidden');
  document.getElementById('summary').innerHTML=[
    ['Mensajes',a.meta.messages.toLocaleString('es-ES')],
    ['Usuarios',a.meta.users.toLocaleString('es-ES')],
    ['Primer mensaje',a.meta.first||'—'],
    ['Último mensaje',a.meta.last||'—']
  ].map(x=>`<div class="metric"><div class="n">${x[1]}</div><div class="l">${x[0]}</div></div>`).join('');

  const colors={}; // Plotly assigns colours automatically.
  plot('chartDay',[{x:a.day.map(x=>x.date),y:a.day.map(x=>x.count),type:'bar'}],baseLayout('Número de mensajes por día'));
  const hu=groupSeries(a.hour_user,'user');
  plot('chartHour',Object.entries(hu).map(([u,rs])=>({x:rs.map(r=>r.hour),y:rs.map(r=>r.count),type:'bar',name:u})),{...baseLayout('Mensajes enviados por hora y usuario'),barmode:'stack',xaxis:{title:'Hora'},yaxis:{title:'Número de mensajes'}});
  const wd=groupSeries(a.weekday_user,'user');
  const order=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  plot('chartWeekday',Object.entries(wd).map(([u,rs])=>{const map=Object.fromEntries(rs.map(r=>[r.weekday,r.count]));return {x:order,y:order.map(w=>map[w]||0),type:'bar',name:u}}),{...baseLayout('Mensajes enviados por día de la semana y usuario'),barmode:'stack'});
  const du=groupSeries(a.daily_user,'user');
  plot('chartUserLine',Object.entries(du).map(([u,rs])=>({x:rs.map(r=>r.date),y:rs.map(r=>r.value),type:'scatter',mode:'lines',name:u})),baseLayout('Mensajes por usuario (no acumulativo)'));
  const dc=groupSeries(a.daily_cum,'user');
  plot('chartUserCum',Object.entries(dc).map(([u,rs])=>({x:rs.map(r=>r.date),y:rs.map(r=>r.value),type:'scatter',mode:'lines',name:u})),baseLayout('Mensajes por usuario (acumulativo)'));
  plot('chartLength',a.lengths.map(x=>({y:x.lengths,type:'box',name:x.user,boxpoints:false})),{...baseLayout('Longitud de mensajes por usuario'),yaxis:{title:'Caracteres'}});
  const uw=Object.entries(a.user_words);
  plot('chartWordsUser',uw.flatMap(([u,rs])=>[{x:rs.map(r=>r.key),y:rs.map(r=>r.count),type:'bar',name:u}]),{...baseLayout('Palabras más frecuentes de cada usuario'),barmode:'group'});
  plot('chartTrigrams',[{x:a.trigrams.slice(0,30).map(x=>x.key).reverse(),y:a.trigrams.slice(0,30).map(x=>x.count).reverse(),type:'bar',orientation:'h'}],baseLayout('Trigramas más frecuentes de todos los usuarios'));
  const ut=Object.entries(a.user_trigrams);
  plot('chartTrigramsUser',ut.flatMap(([u,rs])=>[{x:rs.map(r=>r.key),y:rs.map(r=>r.count),type:'bar',name:u}]),{...baseLayout('Trigramas más frecuentes por usuario'),barmode:'group'});
  plot('chartQuestion',[{x:a.question_day.map(x=>x.date),y:a.question_day.map(x=>x.count),type:'bar'}],baseLayout('Uso de #PreguntaRandom por día'));

  renderWordCloud(a.trigrams);
  renderTables(a);
  renderQuestionTable(a.question_rows);
  renderSpecialStats(a);
  renderProvinceInfo(a);
}

function renderWordCloud(trigrams){
  const c=document.getElementById('wordCloud'),ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  const arr=(trigrams||[]).slice(0,70);
  const max=arr[0]?.count||1, min=arr[arr.length-1]?.count||1;
  const palette=['#1f77b4','#d62728','#2ca02c','#9467bd','#ff7f0e','#17becf','#e377c2','#8c564b','#bcbd22'];
  const placed=[];
  function box(x,y,w,h){return {x:x-w/2,y:y-h/2,w,h}}
  function overlap(a,b){return !(a.x+a.w<b.x||b.x+b.w<a.x||a.y+a.h<b.y||b.y+b.h<a.y)}
  const shuffled=[...arr].sort(()=>Math.random()-.5);
  shuffled.forEach((w,i)=>{
    const size=Math.round(15+42*((w.count-min)/Math.max(1,max-min)));
    ctx.font=`700 ${size}px Arial`;
    const text=w.key, tw=ctx.measureText(text).width+10, th=size+10;
    let ok=false,x=0,y=0;
    for(let k=0;k<300;k++){
      x=30+Math.random()*(c.width-60); y=30+Math.random()*(c.height-60);
      const b=box(x,y,tw,th); if(b.x<5||b.y<5||b.x+b.w>c.width-5||b.y+b.h>c.height-5)continue;
      if(!placed.some(q=>overlap(b,q))){placed.push(b);ok=true;break}
    }
    if(ok){ctx.fillStyle=palette[i%palette.length];ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y)}
  });
}

function downloadWordCloudPNG(){
  const c=document.getElementById('wordCloud'); const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='nube_de_trigramas.png'; a.click();
}
function downloadWordCloudHTML(){
  const c=document.getElementById('wordCloud');
  const img=c.toDataURL('image/png');
  const doc=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nube de trigramas</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff"><img src="${img}" style="max-width:95vw;max-height:95vh"><\/body></html>`;
  const a=document.createElement('a'),u=URL.createObjectURL(new Blob([doc],{type:'text/html'}));a.href=u;a.download='nube_de_trigramas.html';a.click();URL.revokeObjectURL(u);
}
function downloadEmojiCSV(){
  if(!analysis)return; const esc=s=>'"'+String(s).replaceAll('"','""')+'"';
  const out=['Emoji,Veces',...analysis.emojis.map(x=>esc(x.emoji)+','+x.count)].join('\n');
  const a=document.createElement('a'),u=URL.createObjectURL(new Blob(['\ufeff'+out],{type:'text/csv;charset=utf-8'}));a.href=u;a.download='ranking_emojis.csv';a.click();URL.revokeObjectURL(u);
}

function htmlTable(title,headers,rows){
  return `<h4>${title}</h4><div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(String(v??''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function renderTables(a){
  const rows=a.user_msg.map(x=>[x.user,x.count]);
  document.getElementById('tables').innerHTML=
    htmlTable('Mensajes por usuario',['Usuario','Mensajes'],rows)+
    htmlTable('Palabras más frecuentes',['Palabra','Frecuencia'],a.words.map(x=>[x.key,x.count]))+
    htmlTable('Trigramas más frecuentes',['Trigrama','Frecuencia'],a.trigrams.map(x=>[x.key,x.count]));
}

function renderSpecialStats(a){
  const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const z=days.map(d=>Array.from({length:24},(_,hr)=>{const x=a.heatmap.find(v=>v.weekday===d&&v.hour===hr);return x?x.count:0;}));
  plot('chartHeatmap',[{z,x:Array.from({length:24},(_,i)=>i),y:days,type:'heatmap',hoverongaps:false,colorscale:'YlGnBu'}],{...baseLayout('Actividad del grupo: día × hora'),xaxis:{title:'Hora',dtick:1},yaxis:{title:'Día'}});

  // Participación mensual: selector + tarta con el % de mensajes de cada usuario sobre el total del mes.
  const months=[...new Set(a.monthly_participation.map(x=>x.month))];
  const sel=document.getElementById('participationMonth');
  sel.innerHTML=months.map(m=>`<option value="${m}">${m}</option>`).join('');
  const latest=months[months.length-1]||'';
  sel.value=latest;
  function drawParticipation(month){
    const data=a.monthly_participation.filter(x=>x.month===month&&x.count>0).sort((x,y)=>y.count-x.count);
    plot('chartParticipation',[{labels:data.map(x=>x.user),values:data.map(x=>x.count),type:'pie',hole:.28,textinfo:'label+percent',hovertemplate:'<b>%{label}</b><br>Mensajes: %{value}<br>%{percent}<extra></extra>'}],{...baseLayout(`Participación de cada usuario — ${month}`),showlegend:true,legend:{orientation:'v',x:1.02,y:1}});
  }
  sel.onchange=()=>drawParticipation(sel.value);
  drawParticipation(latest);

  plot('chartMonth',[{x:a.month_counts.map(x=>x.month),y:a.month_counts.map(x=>x.count),type:'bar'}],baseLayout('Mensajes por mes'));

  // Media de palabras por mensaje: barras verticales, ordenadas de mayor a menor.
  const av=[...a.avg_words].sort((x,y)=>y.avg-x.avg);
  plot('chartAvgWords',[{x:av.map(x=>x.user),y:av.map(x=>x.avg),type:'bar',text:av.map(x=>x.avg.toFixed(2)),textposition:'outside',cliponaxis:false}],{...baseLayout('Media de palabras por mensaje por usuario'),xaxis:{title:'Usuario',categoryorder:'array',categoryarray:av.map(x=>x.user)},yaxis:{title:'Palabras por mensaje'},margin:{l:60,r:25,t:65,b:110}});

  document.getElementById('emojiTable').innerHTML=htmlTable('Ranking de emojis',['Emoji','Veces'],a.emojis.map(x=>[x.emoji,x.count]));

  const r=a.records;
  const cards=[
    ['📅',r.day[0],`Día con más mensajes: ${r.day[1].toLocaleString('es-ES')}`],
    ['🕐',`${String(r.hour[0]).padStart(2,'0')}:00`,`Hora más activa: ${r.hour[1].toLocaleString('es-ES')} mensajes`],
    ['🏆',r.top_user[0],`Usuario con más mensajes: ${r.top_user[1].toLocaleString('es-ES')}`],
    ['✍️',r.longest[0],`Mensaje más largo: ${r.longest[1].toLocaleString('es-ES')} caracteres`],
    ['🔥',r.user_day[0][0],`Récord diario: ${r.user_day[1].toLocaleString('es-ES')} mensajes (${r.user_day[0][1]})`],
    ['🧠',r.trigram[0],`Trigrama más repetido: ${r.trigram[1].toLocaleString('es-ES')} veces`],
    ['😂',r.emoji[0],`Emoji más utilizado: ${r.emoji[1].toLocaleString('es-ES')} veces`],
    ['❓',r.question_random.toLocaleString('es-ES'),`Mensajes con #PreguntaRandom`]
  ];
  document.getElementById('records').innerHTML=cards.map(x=>`<div class="record"><div class="emoji">${escapeHtml(String(x[0]))}</div><div class="value">${escapeHtml(String(x[1]))}</div><div class="label">${escapeHtml(String(x[2]))}</div></div>`).join('');
}

function normText(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}

async function renderProvinceInfo(a){
  const notice=document.getElementById('provinceNotice');
  if(!excelArrayBuffer){
    notice.textContent='No se ha cargado GR.xlsx. Cárgalo para asignar cada miembro a una provincia y generar el mapa.';
    document.getElementById('provinceTable').innerHTML='';
    document.getElementById('provinceBreakdown').innerHTML='';
    return;
  }
  try{
    const wb=XLSX.read(excelArrayBuffer,{type:'array'});
    // Busca automáticamente la hoja que contenga username/contacto/provincia.
    let data=[];
    for(const sn of wb.SheetNames){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''});
      if(rows.some(r=>Object.keys(r).some(k=>normKey(k)==='username') && Object.keys(r).some(k=>normKey(k)==='contacto'))){data=rows;break}
      if(!data.length && rows.some(r=>Object.keys(r).some(k=>normKey(k)==='provincia'))) data=rows;
    }
    if(!data.length) throw new Error('No encuentro en GR.xlsx las columnas username, contacto y Provincia.');

    const keys=(r)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[normKey(k),v]));
    const rows=data.map(keys);
    const userToContact=new Map(), contactToProvince=new Map(), userToProvince=new Map();
    rows.forEach(r=>{
      const username=String(r.username??'').trim();
      const contacto=String(r.contacto??'').trim();
      const provincia=String(r.provincia??'').trim();
      if(username && contacto) userToContact.set(normKey(username),contacto);
      if(contacto && provincia) contactToProvince.set(normKey(contacto),provincia);
      if(username && provincia) userToProvince.set(normKey(username),provincia);
    });

    // Primero resuelve teléfono/username -> contacto -> provincia; también admite coincidencia directa.
    const prov={}, provUsers={};
    a.user_msg.forEach(u=>{
      const direct=userToProvince.get(normKey(u.user));
      const contact=userToContact.get(normKey(u.user));
      const p=direct || (contact ? contactToProvince.get(normKey(contact)) : undefined) || contactToProvince.get(normKey(u.user));
      if(!p) return;
      const canonical=canonicalProvince(p);
      prov[canonical]=(prov[canonical]||0)+u.count;
      (provUsers[canonical]??=[]).push({user:u.user,count:u.count});
    });

    notice.textContent='Provincias asignadas desde GR.xlsx. Se incluyen también las provincias con 0 mensajes. Haz clic en una provincia para ver el desglose.';
    await renderSpainMap(prov,provUsers);
  }catch(e){notice.textContent='No se pudo leer GR.xlsx: '+e.message;}
}

function normKey(s){
  return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function canonicalProvince(s){
  const k=normKey(s).replace(/[._-]+/g,' ');
  const m={
    'a coruna':'A Coruña','la coruna':'A Coruña','alava':'Álava','araba':'Álava','albacete':'Albacete','alicante':'Alicante','alacant':'Alicante','almeria':'Almería','asturias':'Asturias','avila':'Ávila','badajoz':'Badajoz','barcelona':'Barcelona','bizkaia':'Bizkaia','vizcaya':'Bizkaia','burgos':'Burgos','caceres':'Cáceres','cadiz':'Cádiz','cantabria':'Cantabria','castellon':'Castellón','castello':'Castellón','ciudad real':'Ciudad Real','cordoba':'Córdoba','cuenca':'Cuenca','gipuzkoa':'Gipuzkoa','guipuzcoa':'Gipuzkoa','girona':'Girona','gerona':'Girona','granada':'Granada','guadalajara':'Guadalajara','huelva':'Huelva','huesca':'Huesca','illes balears':'Illes Balears','islas baleares':'Illes Balears','baleares':'Illes Balears','jaen':'Jaén','leon':'León','lleida':'Lleida','la rioja':'La Rioja','rioja':'La Rioja','lugo':'Lugo','madrid':'Madrid','malaga':'Málaga','murcia':'Murcia','navarra':'Navarra','ourense':'Ourense','palencia':'Palencia','las palmas':'Las Palmas','pontevedra':'Pontevedra','salamanca':'Salamanca','santa cruz de tenerife':'Santa Cruz de Tenerife','segovia':'Segovia','sevilla':'Sevilla','soria':'Soria','tarragona':'Tarragona','teruel':'Teruel','toledo':'Toledo','valencia':'Valencia','valencia/valencia':'Valencia','valladolid':'Valladolid','zamora':'Zamora','zaragoza':'Zaragoza','ceuta':'Ceuta','melilla':'Melilla'
  };
  return m[k] || String(s).trim();
}

async function renderSpainMap(prov,provUsers){
  const geoUrl='https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/spain-provinces.geojson';
  const res=await fetch(geoUrl); if(!res.ok) throw new Error('No se pudo cargar el GeoJSON de provincias.');
  const geo=await res.json();

  // Normaliza el nombre del GeoJSON y usa una propiedad interna como clave inequívoca.
  geo.features.forEach((f,i)=>{
    const p=f.properties||{};
    const raw=p.texto||p.name||p.NAMEUNIT||p.province||p.Provincia||p.NOMBRE||p.nombre||'';
    p.map_name=canonicalProvince(raw);
    f.properties=p;
  });
  const names=geo.features.map(f=>f.properties.map_name);
  const values=names.map(n=>Number(prov[n]||0));
  const max=Math.max(...values,1);
  const colorscale=[[0,'#f1f3f5'],[0.001,'#e6f0f7'],[0.10,'#c6ddeb'],[0.25,'#91bfd8'],[0.50,'#5c9bc1'],[0.75,'#3378a5'],[1,'#174b73']];

  const trace={type:'choropleth',geojson:geo,locations:names,z:values,featureidkey:'properties.map_name',text:names,
    hovertemplate:'<b>%{text}</b><br>Mensajes: %{z}<extra></extra>',zmin:0,zmax:max,colorscale,marker:{line:{color:'#1f2937',width:1.4}},colorbar:{title:'Mensajes',thickness:15}};

  // Etiquetas numéricas en el centro aproximado de cada provincia.
  function coords(feature){
    const all=[];
    const walk=c=>{if(typeof c[0]==='number')all.push(c);else c.forEach(walk)};
    walk(feature.geometry.coordinates);
    if(!all.length)return [0,0];
    return [all.reduce((s,p)=>s+p[0],0)/all.length,all.reduce((s,p)=>s+p[1],0)/all.length];
  }
  const pts=geo.features.map((f,i)=>{const [lon,lat]=coords(f);return {lon,lat,name:names[i],value:values[i]};}).filter(x=>x.value>0);
  const labelTrace={type:'scattergeo',lon:pts.map(x=>x.lon),lat:pts.map(x=>x.lat),text:pts.map(x=>String(x.value)),mode:'text',textfont:{size:10,color:'#111827'},hoverinfo:'skip',showlegend:false};

  plot('spainMap',[trace,labelTrace],{...baseLayout('Mensajes por provincia'),geo:{fitbounds:'locations',showland:true,showcoastlines:true,showframe:false,bgcolor:'rgba(0,0,0,0)',projection:{type:'mercator'}},margin:{l:0,r:0,t:55,b:0},clickmode:'event+select'});
  const mapDiv=document.getElementById('spainMap');
  mapDiv.on('plotly_click',ev=>{
    const pt=ev.points?.find(p=>p.data.type==='choropleth');
    if(!pt)return;
    const province=pt.location;
    const users=provUsers[province]||[];
    const total=Number(prov[province]||0);
    const sorted=[...users].sort((a,b)=>b.count-a.count);
    const title=`${escapeHtml(province)} — ${total.toLocaleString('es-ES')} mensajes`;
    document.getElementById('provinceBreakdown').innerHTML=htmlTable(title,['Miembro','Mensajes','% de la provincia'],sorted.map(x=>[x.user,x.count,(x.count/Math.max(total,1)*100).toFixed(2)+' %']));
  });

  // Tabla de las 50 provincias/territorios del GeoJSON, incluidos los ceros.
  const arr=names.map(n=>[n,Number(prov[n]||0)]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));
  document.getElementById('provinceTable').innerHTML=htmlTable('Mensajes por provincia',['Provincia','Mensajes'],arr);
}

document.getElementById('excelBtn').addEventListener('click',()=>{
  if(!analysis) return;
  const wb=XLSX.utils.book_new();
  const add=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),name.slice(0,31));
  add('Mensajes por usuario',analysis.user_msg.map(x=>({Usuario:x.user,Mensajes:x.count})));
  add('Mensajes por día',analysis.day.map(x=>({Fecha:x.date,Mensajes:x.count})));
  add('Palabras más frecuentes',analysis.words.map(x=>({Palabra:x.key,Frecuencia:x.count})));
  add('Trigramas más frecuentes',analysis.trigrams.map(x=>({Trigrama:x.key,Frecuencia:x.count})));
  add('Palabras por usuario',Object.entries(analysis.user_words).flatMap(([u,rs])=>rs.map(x=>({Usuario:u,Palabra:x.key,Frecuencia:x.count}))));
  add('Trigramas por usuario',Object.entries(analysis.user_trigrams).flatMap(([u,rs])=>rs.map(x=>({Usuario:u,Trigrama:x.key,Frecuencia:x.count}))));
  add('Horas por usuario',analysis.hour_user.map(x=>({Usuario:x.user,Hora:x.hour,Mensajes:x.count})));
  add('Días semana',analysis.weekday_user.map(x=>({Usuario:x.user,Día:x.weekday,Mensajes:x.count})));
  add('PreguntaRandom',analysis.question_rows.map(x=>({Fecha:x.date,Usuario:x.user,Mensaje:x.message})));
  add('Participación mensual',analysis.monthly_participation.map(x=>({Mes:x.month,Usuario:x.user,Mensajes:x.count,Porcentaje:x.pct})));
  add('Media palabras',analysis.avg_words.map(x=>({Usuario:x.user,MediaPalabras:x.avg})));
  add('Emojis',analysis.emojis.map(x=>({Emoji:x.emoji,Frecuencia:x.count})));
  add('Mensajes por mes',analysis.month_counts.map(x=>({Mes:x.month,Mensajes:x.count})));
  XLSX.writeFile(wb,'Estadísticas WhatsApp.xlsx');
});


// ---------- Descarga de gráficos ----------
async function downloadChart(id, filename){
  const el=document.getElementById(id);
  if(!el || !el.data) return;
  await Plotly.downloadImage(el,{format:'png',filename:filename,width:1600,height:900,scale:2});
}

function downloadChartHTML(id, filename){
  const el=document.getElementById(id);
  if(!el || !el.data) return;
  const data=JSON.stringify(el.data);
  const layout=JSON.stringify(el.layout);
  const config=JSON.stringify({responsive:true,displaylogo:false});
  const htmlDoc=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${filename}</title><script src="https://cdn.plot.ly/plotly-2.35.2.min.js"><\/script></head><body><div id="chart" style="width:100%;height:95vh"></div><script>Plotly.newPlot("chart",${data},${layout},${config});<\/script></body></html>`;
  const blob=new Blob([htmlDoc],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename+'.html';a.click();
  URL.revokeObjectURL(url);
}

// ---------- #PreguntaRandom: conservar el texto completo ----------
function renderQuestionTable(rows){
  const target=document.getElementById('questionTable');
  if(!rows || !rows.length){
    target.innerHTML='<p class="muted">No se encontraron mensajes con #PreguntaRandom en el intervalo seleccionado.</p>';
    return;
  }
  const tableRows=rows.map(r=>[r.date,r.user,r.message]);
  target.innerHTML=htmlTable(
    `Mensajes con #PreguntaRandom (${rows.length})`,
    ['Fecha','Usuario','Mensaje'],
    tableRows
  );
}

function downloadWordCloudPNG(){
  const c=document.getElementById('wordCloud'); if(!c) return;
  const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='nube_de_palabras.png'; a.click();
}

function downloadWordCloudHTML(){
  const c=document.getElementById('wordCloud'); if(!c) return;
  const data=c.toDataURL('image/png');
  const doc=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nube de palabras</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff"><img src="${data}" style="max-width:100%;height:auto"></body></html>`;
  const url=URL.createObjectURL(new Blob([doc],{type:'text/html;charset=utf-8'})); const a=document.createElement('a');a.href=url;a.download='nube_de_palabras.html';a.click();URL.revokeObjectURL(url);
}
