const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','TRXUSDT'];
const coins = symbols.map(s => s.replace('USDT',''));
function load(){
  if(!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({users:{},orders:[],trades:[]}, null, 2));
  return JSON.parse(fs.readFileSync(DB,'utf8'));
}
function save(db){ fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }
function hash(p){ return crypto.createHash('sha256').update(String(p)).digest('hex'); }
function token(){ return crypto.randomBytes(24).toString('hex'); }
function userFromReq(req){
  const t = req.headers.authorization?.replace('Bearer ','');
  const db = load();
  const u = Object.values(db.users).find(x=>x.token===t);
  return {db,u};
}
async function getPrices(){
  try{
    const url='https://api.binance.com/api/v3/ticker/24hr?symbols='+encodeURIComponent(JSON.stringify(symbols));
    const r = await fetch(url); const data = await r.json();
    return data.map(x=>({symbol:x.symbol, price:+x.lastPrice, change:+x.priceChangePercent, high:+x.highPrice, low:+x.lowPrice, volume:+x.quoteVolume}));
  }catch(e){
    const base={BTCUSDT:62000,ETHUSDT:3400,SOLUSDT:145,BNBUSDT:580,XRPUSDT:.52,DOGEUSDT:.12,ADAUSDT:.42,AVAXUSDT:28,LINKUSDT:14,TRXUSDT:.12};
    return symbols.map(s=>({symbol:s,price:base[s]*(.99+Math.random()*.02),change:(Math.random()*4-2),high:base[s]*1.02,low:base[s]*.98,volume:Math.random()*1e9}));
  }
}
async function getPrice(symbol){ const p=await getPrices(); return p.find(x=>x.symbol===symbol)?.price || 1; }

app.post('/api/register',(req,res)=>{
  const {username,password}=req.body; if(!username||!password) return res.status(400).json({error:'请输入账号和密码'});
  const db=load(); if(db.users[username]) return res.status(400).json({error:'账号已存在'});
  db.users[username]={username,password:hash(password),token:token(),role:Object.keys(db.users).length?'staff':'admin',balances:{USDT:100000},positions:{},createdAt:new Date().toISOString()};
  coins.forEach(c=>db.users[username].balances[c]=0);
  save(db); res.json({user:safe(db.users[username])});
});
app.post('/api/login',(req,res)=>{
  const {username,password}=req.body; const db=load(); const u=db.users[username];
  if(!u||u.password!==hash(password)) return res.status(401).json({error:'账号或密码错误'});
  u.token=token(); save(db); res.json({user:safe(u)});
});
function safe(u){return {username:u.username,token:u.token,role:u.role,balances:u.balances,positions:u.positions};}
app.get('/api/me',(req,res)=>{ const {u}=userFromReq(req); if(!u) return res.status(401).json({error:'未登录'}); res.json({user:safe(u)}); });
app.post('/api/fund',(req,res)=>{ const {db,u}=userFromReq(req); if(!u) return res.status(401).json({error:'未登录'}); u.balances.USDT += 100000; save(db); res.json({user:safe(u),message:'已领取 100,000 USDT 模拟资金'}); });
app.get('/api/markets',async(req,res)=> res.json(await getPrices()));
app.get('/api/klines/:symbol',async(req,res)=>{
  const symbol=req.params.symbol; try{ const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=80`); const d=await r.json(); res.json(d.map(k=>({time:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4]}))); }catch(e){res.json([])}
});
app.post('/api/order',async(req,res)=>{
  const {db,u}=userFromReq(req); if(!u) return res.status(401).json({error:'未登录'});
  const {symbol,side,amount}=req.body; const qty=+amount; if(!symbols.includes(symbol)||!['buy','sell'].includes(side)||qty<=0) return res.status(400).json({error:'参数错误'});
  const coin=symbol.replace('USDT',''), price=await getPrice(symbol), cost=price*qty;
  if(side==='buy'){ if(u.balances.USDT<cost) return res.status(400).json({error:'USDT余额不足'}); u.balances.USDT-=cost; u.balances[coin]=(u.balances[coin]||0)+qty; }
  else { if((u.balances[coin]||0)<qty) return res.status(400).json({error:coin+'余额不足'}); u.balances[coin]-=qty; u.balances.USDT+=cost; }
  const order={id:crypto.randomUUID(),username:u.username,symbol,side,amount:qty,price,total:cost,status:'filled',time:new Date().toISOString()};
  db.orders.unshift(order); db.trades.unshift(order); save(db); res.json({order,user:safe(u)});
});
app.get('/api/orders',(req,res)=>{ const {db,u}=userFromReq(req); if(!u) return res.status(401).json({error:'未登录'}); res.json(db.orders.filter(o=>o.username===u.username)); });
app.get('/api/admin/users',(req,res)=>{ const {db,u}=userFromReq(req); if(!u||u.role!=='admin') return res.status(403).json({error:'仅管理员'}); res.json(Object.values(db.users).map(x=>({username:x.username,role:x.role,balances:x.balances,createdAt:x.createdAt}))); });
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('OKX Staff Sim running on port '+PORT));
