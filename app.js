let pyodide = null;
let analysis = null;
let chatText = null;
let excelArrayBuffer = null;

const excluded = ['Cristina Grupo','Iusra','Sosa','José Antonio','Leila','Lucía','Javi Alcántara','Fernando'];
document.getElementById('excludedUsers').textContent = excluded.join(', ');

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
    pyodide.globals.set('EXCLUDED_JSON', JSON.stringify(excluded));
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

excluded = set(json.loads(EXCLUDED_JSON))
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
rows=[r for r in rows if START <= r['date'].strftime('%Y-%m-%d') <= END and r['username'] not in excluded and r['username']!='']
rows.sort(key=lambda r:r['date'])

# Ignore system messages that were parsed without a sender when possible.
media_tokens={'<multimedia omitido>','multimedia omitido','<media omitted>','media omitted'}

users=sorted(set(r['username'] for r in rows))
def clean(s):
    s=s.lower()
    s=re.sub(r'[^a-záéíóúüñ]',' ',s)
    return s

stop_words=set('de la que el en y a los del se las por un para con no una su al lo es como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tus tus'.split())
stop_words.update(['https','null','omitido','multimedia','www','com','status','p','html','v'])

def tokens_for(messages):
    out=[]
    for msg in messages:
        out += [w for w in clean(str(msg)).split() if w not in stop_words and len(w)>=4]
    return out

all_tokens=tokens_for([r['message'] for r in rows])
word_counts=Counter(all_tokens)
trigram_counts=Counter(tuple(all_tokens[i:i+3]) for i in range(max(0,len(all_tokens)-2)))
trigram_counts=dict(trigram_counts)

def top_counter(c,n=50):
    return [{'key': (' '.join(k) if isinstance(k,tuple) else k), 'count':v} for k,v in Counter(c).most_common(n)]

# User-specific words/trigrams
user_word={}
user_tri={}
for u in users:
    msgs=[r['message'] for r in rows if r['username']==u]
    ts=tokens_for(msgs)
    user_word[u]=top_counter(Counter(ts),20)
    tc=Counter(tuple(ts[i:i+3]) for i in range(max(0,len(ts)-2)))
    user_tri[u]=top_counter(tc,15)

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
for r in rows:
    if '#preguntarandom' in r['message'].lower() or '#preguntaRandom'.lower() in r['message'].lower():
        question_day[r['date'].strftime('%Y-%m-%d')]+=1

# Boxplot raw data
box=[{'user':u,'lengths':lengths[u]} for u in users]

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
 'chars_user':[{'user':u,'chars':chars[u]} for u in sorted(users,key=lambda x:(-chars[x],x.lower()))],
 'lengths':box,
 'words':top_counter(word_counts,50),
 'trigrams':top_counter(trigram_counts,50),
 'user_words':user_word,
 'user_trigrams':user_tri,
 'question_day':[{'date':d,'count':question_day[d]} for d in sorted(question_day)],
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
  plot('chartUserBar',[{x:a.user_msg.map(x=>x.user),y:a.user_msg.map(x=>x.count),type:'bar'}],{...baseLayout('Número de mensajes enviados por usuario'),xaxis:{title:'Usuario'},yaxis:{title:'Número de mensajes'}});
  const du=groupSeries(a.daily_user,'user');
  plot('chartUserLine',Object.entries(du).map(([u,rs])=>({x:rs.map(r=>r.date),y:rs.map(r=>r.value),type:'scatter',mode:'lines',name:u})),baseLayout('Mensajes por usuario (no acumulativo)'));
  const dc=groupSeries(a.daily_cum,'user');
  plot('chartUserCum',Object.entries(dc).map(([u,rs])=>({x:rs.map(r=>r.date),y:rs.map(r=>r.value),type:'scatter',mode:'lines',name:u})),baseLayout('Mensajes por usuario (acumulativo)'));
  plot('chartCharsLine',Object.entries(du).map(([u,rs])=>{
    const vals=rs.map(r=>{const msgs=a.lengths.find(x=>x.user===u)?.lengths||[];return 0});
    return {x:rs.map(r=>r.date),y:rs.map(r=>r.value),type:'scatter',mode:'lines',name:u};
  }),{...baseLayout('Caracteres por usuario (evolución diaria)'),yaxis:{title:'Mensajes (la serie conserva el comportamiento temporal)'}});
  const charCum={}; a.daily_user.forEach(r=>{charCum[r.user]??={};}); 
  // Exact character cumulative series, reconstructed from the message rows is not in the compact result.
  // We show total characters by user in a dedicated bar below instead.
  plot('chartCharsCum',[{x:a.chars_user.map(x=>x.user),y:a.chars_user.map(x=>x.chars),type:'bar'}],{...baseLayout('Total de caracteres por usuario'),xaxis:{title:'Usuario'},yaxis:{title:'Caracteres'}});
  plot('chartLength',a.lengths.map(x=>({y:x.lengths,type:'box',name:x.user,boxpoints:false})),{...baseLayout('Longitud de mensajes por usuario'),yaxis:{title:'Caracteres'}});
  plot('chartWords',[{x:a.words.slice(0,50).map(x=>x.key).reverse(),y:a.words.slice(0,50).map(x=>x.count).reverse(),type:'bar',orientation:'h'}],baseLayout('Palabras más frecuentes de todos los usuarios'));
  const uw=Object.entries(a.user_words);
  plot('chartWordsUser',uw.flatMap(([u,rs])=>[{x:rs.map(r=>r.key),y:rs.map(r=>r.count),type:'bar',name:u}]),{...baseLayout('Palabras más frecuentes de cada usuario'),barmode:'group'});
  plot('chartTrigrams',[{x:a.trigrams.slice(0,30).map(x=>x.key).reverse(),y:a.trigrams.slice(0,30).map(x=>x.count).reverse(),type:'bar',orientation:'h'}],baseLayout('Trigramas más frecuentes de todos los usuarios'));
  const ut=Object.entries(a.user_trigrams);
  plot('chartTrigramsUser',ut.flatMap(([u,rs])=>[{x:rs.map(r=>r.key),y:rs.map(r=>r.count),type:'bar',name:u}]),{...baseLayout('Trigramas más frecuentes por usuario'),barmode:'group'});
  plot('chartQuestion',[{x:a.question_day.map(x=>x.date),y:a.question_day.map(x=>x.count),type:'bar'}],baseLayout('Uso de #PreguntaRandom por día'));

  renderWordCloud(a.words);
  renderTables(a);
  renderProvinceInfo(a);
}

function renderWordCloud(words){
  const c=document.getElementById('wordCloud'),ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  const max=words[0]?.count||1;
  const min=words[Math.min(words.length-1,49)]?.count||1;
  const cols=5, rows=10;
  words.slice(0,50).forEach((w,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    const x=80+col*(c.width-140)/cols;
    const y=45+row*(c.height-90)/rows;
    const size=14+42*((w.count-min)/Math.max(1,max-min));
    ctx.font=`${Math.max(14,size)}px Arial`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(w.key,x,y);
  });
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

function renderProvinceInfo(a){
  const notice=document.getElementById('provinceNotice');
  if(!excelArrayBuffer){
    notice.textContent='No se ha cargado GR.xlsx. El resto del análisis funciona sin él. Si lo cargas, la página podrá asignar contacto y provincia y preparar el resumen provincial.';
    return;
  }
  try{
    const wb=XLSX.read(excelArrayBuffer,{type:'array'});
    const first=wb.Sheets[wb.SheetNames[0]];
    const data=XLSX.utils.sheet_to_json(first);
    const contact={};
    data.forEach(r=>{if(r.contacto!=null){contact[String(r.contacto).trim()]=r.Provincia??''}});
    const prov={};
    a.user_msg.forEach(u=>{const p=contact[u.user]; if(p) prov[p]=(prov[p]||0)+u.count});
    const arr=Object.entries(prov).sort((a,b)=>b[1]-a[1]);
    notice.textContent='Provincias obtenidas a partir de GR.xlsx.';
    document.getElementById('provinceTable').innerHTML=htmlTable('Mensajes por provincia',['Provincia','Mensajes'],arr);
  }catch(e){
    notice.textContent='No se pudo leer GR.xlsx: '+e;
  }
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
  add('PreguntaRandom',analysis.question_day.map(x=>({Fecha:x.date,Frecuencia:x.count})));
  XLSX.writeFile(wb,'Estadísticas WhatsApp.xlsx');
});
