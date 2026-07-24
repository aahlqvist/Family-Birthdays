import { useState, useEffect } from "react";

const STORAGE_KEY = "family-birthdays-members";
const useRef = React.useRef; // shim for module-level access
const STORAGE_VERSION = "v17";

// ── Cloud sync (Cloudflare Worker) ────────────────────────────────────────────
// Set WORKER_URL to your deployed Worker URL to enable family sharing.
// Leave empty ('') to run in local-only mode (no setup screen, no sync).
const WORKER_URL = 'https://family-birthdays.andreas-ahlqvist.workers.dev';
const CODE_KEY   = 'family-birthdays-code';

function generateCode() {
  // Human-readable, unguessable: e.g. "ABCD-EFGH-JKLM"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let c = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) c += '-';
    c += chars[Math.floor(Math.random() * chars.length)];
  }
  return c;
}
const VERSION_KEY = "family-birthdays-version";

const DEFAULT_MEMBERS = [
  { id:1,  name:"Helene",    role:"Mormor",        birthdate:"1946-03-25", imageUrl:null, parentId:null, parent2Id:null, spouseId:2  },
  { id:2,  name:"Stein",     role:"Morfar",         birthdate:"1946-03-05", imageUrl:null, parentId:null, parent2Id:null, spouseId:1  },
  { id:3,  name:"Thomas",    role:"Farfar",         birthdate:"1951-08-22", imageUrl:null, parentId:null, parent2Id:null, spouseId:4  },
  { id:4,  name:"Anita",     role:"Farmor",         birthdate:"1952-01-27", imageUrl:null, parentId:null, parent2Id:null, spouseId:3  },
  { id:5,  name:"Gabriella", role:"Super-Mom",      birthdate:"1977-06-19", imageUrl:null, parentId:1,    parent2Id:2,    spouseId:6,  crossMarriage:true },
  { id:6,  name:"Andreas",   role:"Grand Master",   birthdate:"1976-07-29", imageUrl:null, parentId:3,    parent2Id:4,    spouseId:5,  crossMarriage:true },
  { id:7,  name:"Olivia",    role:"Smartest funniest coolest prettiest most humble / favorite child", birthdate:"2008-06-05", imageUrl:null, parentId:6, parent2Id:5, spouseId:null },
  { id:8,  name:"LUCAS",     role:"Cooler & awesomer than Olivia", birthdate:"2010-09-19", imageUrl:null, parentId:5, parent2Id:6, spouseId:null },
  { id:9,  name:"Liam",      role:"Better than Noah · skills ^ aura · ♾️", birthdate:"2013-02-15", imageUrl:null, parentId:5, parent2Id:6, spouseId:null },
  { id:10, name:"Noah",      role:"Better than Lucas & Liam combined ♾️", birthdate:"2015-08-25", imageUrl:null, parentId:6, parent2Id:5, spouseId:null },
  { id:11, name:"Toffee",    role:"Goodest girl · cutest puppy · goddess", birthdate:"2020-12-08", imageUrl:null, parentId:5, parent2Id:6, spouseId:null },
];

// ── Swedish Flag Frost design tokens ─────────────────────────────────────────
const D = {
  // Backgrounds — midnight navy to deep blue
  bg0:      "#060f26",   // page / outermost bg
  bg1:      "#0b1a38",   // card surface
  bg2:      "#0f2248",   // input / row bg
  bg3:      "#162d5c",   // hover / subtle surface
  bgGlass:  "#0d1f4299", // semi-transparent glass for panels

  // Borders
  border:   "#4a90e222", // icy blue tint border
  borderHi: "#4a90e244",
  borderGold: "#f5c84233",

  // Text — always readable on dark navy
  text1: "#e8f0fe",   // primary — bright ice white
  text2: "#8aafd4",   // secondary — cool blue-grey
  text3: "#4a6d99",   // muted

  // Brand colours — Swedish palette
  gold:   "#f5c842",   // Swedish yellow/gold
  goldLo: "#f5c84218",
  blue:   "#3a8de8",   // Swedish blue (accent)
  blueLo: "#3a8de818",
  ice:    "#b0d0ff",   // icy highlight
  iceLo:  "#b0d0ff14",

  // Semantic
  accent:  "#3a8de8",
  heart:   "#f5c842",  // gold hearts in tree (Swedish cross colour)
  line:    "#f5c84255",  // tree connector lines (gold)
  red:     "#f87171",
  green:   "#34d399",
};

// ── Per-member palette — cool blues + gold ─────────────────────────────────
const PALETTE = [
  {fg:"#60a5fa", bg:"#60a5fa18"}, // blue       — Helene   (id 1)
  {fg:"#7dd3fc", bg:"#7dd3fc18"}, // sky        — Stein    (id 2)
  {fg:"#34d399", bg:"#34d39918"}, // teal       — Thomas   (id 3)
  {fg:"#67e8f9", bg:"#67e8f918"}, // cyan       — Anita    (id 4)
  {fg:"#a78bfa", bg:"#a78bfa18"}, // violet     — Gabriella(id 5)
  {fg:"#c084fc", bg:"#c084fc18"}, // purple     — Andreas  (id 6)
  {fg:"#f472b6", bg:"#f472b618"}, // pink       — Olivia   (id 7)
  {fg:"#fb923c", bg:"#fb923c18"}, // orange     — LUCAS    (id 8)
  {fg:"#fbbf24", bg:"#fbbf2418"}, // amber      — Liam     (id 9)
  {fg:"#4ade80", bg:"#4ade8018"}, // green      — Noah     (id 10)
  {fg:"#e879f9", bg:"#e879f918"}, // fuchsia    — Toffee   (id 11)
];
function palFor(member) { return PALETTE[(member.id - 1) % PALETTE.length]; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
}
function calcAge(b) {
  const bd = parseDate(b); if (!bd) return null;
  const now = new Date();
  let a = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) a--;
  return a;
}
function nextBday(b) {
  const bd = parseDate(b); if (!bd) return null;
  const now = new Date();
  let n = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
  if (n <= now) n = new Date(now.getFullYear()+1, bd.getMonth(), bd.getDate());
  return n;
}
function daysUntil(d) { return Math.ceil((d - new Date()) / 86400000); }
function fmtDate(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
}
function fmtNext(s) {
  const d = nextBday(s);
  return d ? d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) : "—";
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(b) {
  const [, tick] = useState(0);
  useEffect(()=>{ const id=setInterval(()=>tick(t=>t+1),1000); return ()=>clearInterval(id); },[]);
  const t = nextBday(b); if (!t) return {days:0,hours:0,minutes:0,seconds:0};
  const diff = Math.max(0, t - new Date());
  return {
    days:   Math.floor(diff/86400000),
    hours:  Math.floor((diff/3600000)%24),
    minutes:Math.floor((diff/60000)%60),
    seconds:Math.floor((diff/1000)%60),
  };
}

// ── Snowflake SVG (reusable) ──────────────────────────────────────────────────
function Snowflake({ x, y, r, opacity=0.5 }) {
  const arms = [0,45,90,135];
  return (
    <g transform={`translate(${x},${y})`} opacity={opacity}>
      {arms.map(a => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1="0" y1={-r} x2="0" y2={r} stroke="#a8c8ff" strokeWidth="0.8"/>
          <line x1={-r*0.4} y1={-r*0.55} x2="0" y2={-r*0.7} stroke="#a8c8ff" strokeWidth="0.6"/>
          <line x1={r*0.4}  y1={-r*0.55} x2="0" y2={-r*0.7} stroke="#a8c8ff" strokeWidth="0.6"/>
        </g>
      ))}
      <circle cx="0" cy="0" r={r*0.18} fill="#c8e0ff"/>
    </g>
  );
}

// ── Background: Swedish Flag Frost ────────────────────────────────────────────
function FrostBackground() {
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none",
    }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        {/* Base deep navy */}
        <rect width="100%" height="100%" fill="#060f26"/>

        {/* Swedish cross bands — horizontal */}
        <rect x="0" y="38%" width="100%" height="12%" fill="#0a3a8a" opacity="0.28"/>
        {/* Swedish cross bands — vertical */}
        <rect x="30%" y="0" width="8%" height="100%" fill="#0a3a8a" opacity="0.28"/>

        {/* Gold cross inner glow lines */}
        <rect x="0" y="43%" width="100%" height="2%" fill="#f5c842" opacity="0.07"/>
        <rect x="33%" y="0" width="2%" height="100%" fill="#f5c842" opacity="0.07"/>

        {/* Subtle radial light from cross centre */}
        <ellipse cx="34%" cy="44%" rx="40%" ry="30%" fill="#1a5aaa" opacity="0.07"/>

        {/* Snowflakes — scattered naturally */}
        <Snowflake x="8%"  y="12%" r={18} opacity={0.45}/>
        <Snowflake x="72%" y="8%"  r={14} opacity={0.35}/>
        <Snowflake x="88%" y="30%" r={22} opacity={0.4}/>
        <Snowflake x="15%" y="65%" r={16} opacity={0.35}/>
        <Snowflake x="55%" y="72%" r={26} opacity={0.3}/>
        <Snowflake x="92%" y="78%" r={18} opacity={0.38}/>
        <Snowflake x="42%" y="18%" r={12} opacity={0.3}/>
        <Snowflake x="3%"  y="88%" r={14} opacity={0.32}/>
        <Snowflake x="78%" y="92%" r={16} opacity={0.28}/>
        <Snowflake x="62%" y="45%" r={10} opacity={0.22}/>
        <Snowflake x="22%" y="36%" r={8}  opacity={0.2}/>

        {/* Frost speck dots */}
        {[[12,22],[28,78],[48,55],[66,15],[82,60],[95,42],[35,90],[20,50]].map(([px,py],i)=>(
          <circle key={i} cx={`${px}%`} cy={`${py}%`} r="1.5" fill="#a8c8ff" opacity="0.3"/>
        ))}
      </svg>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ member, size=56 }) {
  const { fg, bg } = palFor(member);
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background: member.imageUrl ? "transparent" : bg,
      border:`2px solid ${fg}66`,
      display:"flex", alignItems:"center", justifyContent:"center",
      overflow:"hidden", flexShrink:0,
    }}>
      {member.imageUrl
        ? <img src={member.imageUrl} alt={member.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        : <span style={{fontSize:size*0.4, fontWeight:500, color:fg, lineHeight:1}}>{member.name.charAt(0).toUpperCase()}</span>
      }
    </div>
  );
}

// ── Birthday Card ─────────────────────────────────────────────────────────────
function BirthdayCard({ member, onEdit, onDelete }) {
  const next  = nextBday(member.birthdate);
  const days  = next ? daysUntil(next) : null;
  const soon  = days !== null && days <= 30;
  const today = days === 0;
  const age   = calcAge(member.birthdate);
  const { fg } = palFor(member);
  const cd = useCountdown(member.birthdate);
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background: hov ? D.bg3 : D.bg1,
        borderRadius:16,
        border: soon ? `1px solid ${D.gold}55` : `1px solid ${D.border}`,
        padding:"20px 18px 16px",
        display:"flex", flexDirection:"column", alignItems:"center",
        position:"relative", overflow:"hidden",
        transition:"transform 0.18s ease, background 0.18s ease",
        transform: hov ? "translateY(-4px)" : "none",
        backdropFilter:"blur(12px)",
      }}
    >
      {/* Gold top-edge shimmer on upcoming */}
      {soon && <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${D.gold},transparent)`}}/>}

      {/* Upcoming badge */}
      {soon && (
        <div style={{
          position:"absolute",top:12,right:12,
          background: today ? D.gold : D.goldLo,
          color: today ? D.bg0 : D.gold,
          fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:99,
          border: today?"none":`1px solid ${D.gold}55`,
          letterSpacing:"0.05em",textTransform:"uppercase",
          animation:today?"todaypulse 2s ease-in-out infinite":"none",
        }}>
          {today ? "🎂 Today" : `${days}d away`}
        </div>
      )}

      {/* Avatar + age */}
      <div style={{position:"relative",marginBottom:14}}>
        <Avatar member={member} size={72}/>
        {age !== null && (
          <div style={{
            position:"absolute",bottom:-4,right:-6,
            background:D.bg3, border:`1px solid ${D.borderHi}`,
            borderRadius:99, padding:"1px 8px",
            fontSize:12,fontWeight:500,color:D.text1,
          }}>{age}</div>
        )}
      </div>

      <div style={{fontSize:17,fontWeight:500,color:D.text1,marginBottom:4,textAlign:"center"}}>{member.name}</div>
      <div style={{
        fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",
        color:fg, background:`${fg}18`,
        padding:"3px 10px",borderRadius:99,marginBottom:16,
        maxWidth:"92%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
        border:`1px solid ${fg}22`,
      }} title={member.role}>{member.role}</div>

      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:6}}>
        {[
          {icon:"ti-cake",     label:"Born",      val:fmtDate(member.birthdate)},
          {icon:"ti-calendar", label:"Next party", val:fmtNext(member.birthdate), hi:soon},
        ].map(({icon,label,val,hi})=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:D.bg2,borderRadius:10,border:`1px solid ${D.border}`}}>
            <span style={{color:D.text2,display:"flex",alignItems:"center",gap:7,fontSize:12}}>
              <i className={`ti ${icon}`} style={{fontSize:13,color:D.text3}} aria-hidden="true"/> {label}
            </span>
            <span style={{fontSize:12,fontWeight:500,color:hi?D.gold:D.text1}}>{val}</span>
          </div>
        ))}

        {/* Countdown */}
        <div style={{padding:"10px 12px",background:D.bg2,borderRadius:10,border:`1px solid ${D.border}`}}>
          <div style={{fontSize:10,color:D.text3,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
            <i className="ti ti-clock" style={{fontSize:12}} aria-hidden="true"/> Countdown
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[["Days",cd.days],["Hrs",cd.hours],["Min",cd.minutes],["Sec",cd.seconds]].map(([lbl,val])=>(
              <div key={lbl} style={{textAlign:"center",background:D.bg3,borderRadius:8,padding:"7px 4px",border:`1px solid ${D.border}`}}>
                <div style={{fontSize:16,fontWeight:500,color:D.ice,lineHeight:1.2,fontVariantNumeric:"tabular-nums"}}>{String(val).padStart(2,"0")}</div>
                <div style={{fontSize:9,color:D.text3,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{display:"flex",gap:8,marginTop:14,width:"100%"}}>
        {[
          {label:"Edit",   icon:"ti-edit",  danger:false, onClick:()=>onEdit(member)},
          {label:"Remove", icon:"ti-trash", danger:true,  onClick:()=>{ if(confirm(`Remove ${member.name}?`)) onDelete(member.id); }},
        ].map(({label,icon,danger,onClick})=>(
          <button key={label} onClick={onClick}
            style={{flex:1,padding:"7px",fontSize:12,border:`1px solid ${D.borderHi}`,borderRadius:8,cursor:"pointer",background:"transparent",color:D.text2,display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"background 0.12s,color 0.12s,border-color 0.12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=danger?"#f8717118":D.blueLo;e.currentTarget.style.color=danger?D.red:D.ice;e.currentTarget.style.borderColor=danger?"#f8717155":D.borderHi;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=D.text2;e.currentTarget.style.borderColor=D.borderHi;}}
          >
            <i className={`ti ${icon}`} style={{fontSize:13}} aria-hidden="true"/> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Member Form ───────────────────────────────────────────────────────────────
function MemberForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({name:initial?.name||"",role:initial?.role||"",birthdate:initial?.birthdate||"",imageUrl:initial?.imageUrl||""});
  const [err, setErr] = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const submit = e => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!form.role.trim()) { setErr("Role is required"); return; }
    if (!form.birthdate)   { setErr("Birthdate is required"); return; }
    onSave(form);
  };
  const field = {
    display:"block",width:"100%",boxSizing:"border-box",
    padding:"9px 12px",fontSize:14,
    border:`1px solid ${D.borderHi}`,borderRadius:8,
    background:D.bg2,color:D.text1,marginTop:5,outline:"none",
  };
  const lbl = {fontSize:12,color:D.text2,display:"block",marginTop:14,fontWeight:500,letterSpacing:"0.03em"};
  return (
    <form onSubmit={submit}>
      {err && <div style={{color:D.red,fontSize:12,marginBottom:8,padding:"8px 12px",background:"#f8717118",borderRadius:8}}>{err}</div>}
      <label style={lbl}>Name *<input value={form.name} onChange={e=>set("name",e.target.value)} style={field} placeholder="e.g. Grandpa Joe"/></label>
      <label style={lbl}>Role *<input value={form.role} onChange={e=>set("role",e.target.value)} style={field} placeholder="e.g. Grandfather"/></label>
      <label style={lbl}>Date of birth *<input type="date" value={form.birthdate} onChange={e=>set("birthdate",e.target.value)} style={{...field,colorScheme:"dark"}}/></label>
      <label style={lbl}>Photo URL (optional)<input value={form.imageUrl} onChange={e=>set("imageUrl",e.target.value)} style={field} placeholder="https://..."/></label>
      <div style={{display:"flex",gap:8,marginTop:20}}>
        <button type="submit" style={{flex:1,padding:"9px",background:D.blue,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:500}}>
          {initial ? "Save changes" : "Add member"}
        </button>
        <button type="button" onClick={onCancel} style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${D.borderHi}`,borderRadius:8,cursor:"pointer",fontSize:14,color:D.text2}}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Couple key helper ────────────────────────────────────────────────────────
function coupleKey(id1, id2) {
  return `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;
}

// ── Couple date modal ─────────────────────────────────────────────────────────
function CoupleModal({ ckKey, coupleName, existing, onSave, onClose }) {
  const [type, setType] = useState(existing?.type || "Wedding Date");
  const [date, setDate] = useState(existing?.date || "");
  const [err,  setErr]  = useState("");
  function save(e) {
    e.preventDefault();
    if (!date) { setErr("Please select a date"); return; }
    onSave(ckKey, { type, date });
  }
  const sel = {display:"block",width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:14,border:`1px solid ${D.borderHi}`,borderRadius:8,background:D.bg2,color:D.text1,marginTop:5,outline:"none",cursor:"pointer"};
  const lbl = {fontSize:12,color:D.text2,display:"block",marginTop:14,fontWeight:500,letterSpacing:"0.03em"};
  return (
    <Modal title={coupleName} subtitle="Set a relationship milestone" onClose={onClose}>
      <form onSubmit={save}>
        {err && <div style={{color:D.red,fontSize:12,marginBottom:8,padding:"8px 12px",background:"#f8717118",borderRadius:8}}>{err}</div>}
        <label style={lbl}>Type<select value={type} onChange={e=>setType(e.target.value)} style={sel}><option>Wedding Date</option><option>First Date</option></select></label>
        <label style={lbl}>Date *<input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...sel,colorScheme:"dark"}}/></label>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button type="submit" style={{flex:1,padding:"9px",background:D.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:500}}>Save</button>
          {existing && <button type="button" onClick={()=>onSave(ckKey,null)} style={{padding:"9px 14px",background:"transparent",border:`1px solid ${D.red}44`,borderRadius:8,cursor:"pointer",fontSize:14,color:D.red}}>Remove</button>}
          <button type="button" onClick={onClose} style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${D.borderHi}`,borderRadius:8,cursor:"pointer",fontSize:14,color:D.text2}}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, subtitle, children, onClose }) {
  return (
    <div
      style={{position:"fixed",inset:0,background:"rgba(2,8,24,0.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16,backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}
    >
      <div style={{
        background:D.bg1,borderRadius:16,
        border:`1px solid ${D.borderGold}`,
        boxShadow:`0 0 0 1px ${D.border}`,
        padding:"22px 22px 26px",width:"100%",maxWidth:400,maxHeight:"90vh",overflowY:"auto",
      }}>
        {/* Gold top rule */}
        <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:`linear-gradient(90deg,transparent,${D.gold}66,transparent)`,borderRadius:4}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:subtitle?12:18}}>
          <div>
            <div style={{fontSize:16,fontWeight:500,color:D.text1}}>{title}</div>
            {subtitle && <div style={{fontSize:12,color:D.text3,marginTop:3}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:D.text3,fontSize:20,lineHeight:1,padding:4}}
            onMouseEnter={e=>e.currentTarget.style.color=D.text1}
            onMouseLeave={e=>e.currentTarget.style.color=D.text3}>
            <i className="ti ti-x" aria-hidden="true"/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Link Type Picker ──────────────────────────────────────────────────────────
function LinkPicker({ anchor, onPick, onRemove, onClose, canAddParent, canAddChild }) {
  // Enforce binary-tree structure: only show options valid for this member's position
  const allOptions = [
    { type:"parent", icon:"ti-arrow-up",   label:"Add a parent",
      desc:`Add a parent couple above ${anchor.name}'s row`, show: canAddParent },
    { type:"child",  icon:"ti-arrow-down", label:"Add a child",
      desc:`Add a child to ${anchor.name}'s family`, show: canAddChild },
  ];
  const options = allOptions.filter(o => o.show);
  return (
    <Modal title={anchor.name} subtitle={options.length ? "Add a relative or remove this member" : "Remove this member"} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
        {options.map(({type,icon,label,desc})=>(
          <button key={type} onClick={()=>onPick(type)}
            style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:D.bg2,border:`1px solid ${D.borderHi}`,borderRadius:12,cursor:"pointer",textAlign:"left",transition:"border-color 0.15s,background 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=`${D.gold}66`;e.currentTarget.style.background=D.bg3;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=D.borderHi;e.currentTarget.style.background=D.bg2;}}
          >
            <div style={{width:38,height:38,borderRadius:10,background:D.goldLo,border:`1px solid ${D.gold}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <i className={`ti ${icon}`} style={{fontSize:18,color:D.gold}} aria-hidden="true"/>
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:500,color:D.text1}}>{label}</div>
              <div style={{fontSize:11,color:D.text3,marginTop:2}}>{desc}</div>
            </div>
            <i className="ti ti-chevron-right" style={{fontSize:14,color:D.text3,marginLeft:"auto"}} aria-hidden="true"/>
          </button>
        ))}

        {/* Divider */}
        <div style={{height:1,background:D.borderHi,margin:"4px 0"}}/>

        {/* Remove button */}
        <button onClick={onRemove}
          style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:D.bg2,border:`1px solid ${D.borderHi}`,borderRadius:12,cursor:"pointer",textAlign:"left",transition:"border-color 0.15s,background 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#f8717166";e.currentTarget.style.background="#f8717112";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=D.borderHi;e.currentTarget.style.background=D.bg2;}}
        >
          <div style={{width:38,height:38,borderRadius:10,background:"#f8717118",border:"1px solid #f8717144",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="ti ti-trash" style={{fontSize:18,color:D.red}} aria-hidden="true"/>
          </div>
          <div>
            <div style={{fontSize:14,fontWeight:500,color:D.red}}>Remove member</div>
            <div style={{fontSize:11,color:D.text3,marginTop:2}}>{`Remove ${anchor.name} from the family`}</div>
          </div>
        </button>
      </div>
    </Modal>
  );
}

// ── Tree node card ────────────────────────────────────────────────────────────
function TreeNode({ member, highlight, onClick, spouseName, depth }) {
  const age = calcAge(member.birthdate);
  const { fg, bg } = palFor(member);
  const [hov, setHov] = useState(false);

  // Placeholder "?" member — show an inviting dashed card
  if (member.placeholder) {
    return (
      <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
        title="Click to fill in this parent's details"
        style={{
          width:110, borderRadius:12, padding:"12px 8px",
          border:`2px dashed ${hov ? D.gold : D.borderHi}`,
          background: hov ? D.bg3 : "transparent",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          cursor:"pointer",transition:"all 0.15s",gap:6, minHeight:80,
        }}>
        <div style={{
          width:36,height:36,borderRadius:"50%",
          background:"transparent",border:`2px dashed ${hov ? D.gold : D.text3}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:18,color:hov?D.gold:D.text3,
        }}>?</div>

        <div style={{fontSize:10,color:hov?D.gold:D.text3,textAlign:"center",lineHeight:1.4,maxWidth:90}}>
          Unknown {member.parentRole || "parent"}{member.childName ? <> of<br/><span style={{fontWeight:500}}>{member.childName}</span></> : ""}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      title="Click to add a relative"
      style={{
        background: hov ? D.bg3 : D.bg1,
        border: highlight
          ? `1px solid ${D.gold}88`
          : hov ? `1px solid ${D.blue}88` : `1px solid ${D.border}`,
        borderRadius:12,
        padding:"10px 8px 9px",
        width:110, textAlign:"center",
        display:"inline-flex", flexDirection:"column", alignItems:"center",
        position:"relative", cursor:"pointer",
        transition:"background 0.15s,border-color 0.15s,transform 0.15s",
        transform: hov ? "translateY(-2px)" : "none",
        backdropFilter:"blur(8px)",
      }}
    >
      {highlight && <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:`linear-gradient(90deg,transparent,${D.gold},transparent)`}}/>}
      <div style={{position:"absolute",top:-8,right:-8,width:18,height:18,borderRadius:"50%",background:D.blue,border:`2px solid ${D.bg0}`,display:"flex",alignItems:"center",justifyContent:"center",opacity:hov?1:0,transition:"opacity 0.15s",fontSize:12,color:"#fff",fontWeight:700,lineHeight:1}}>+</div>
      <Avatar member={member} size={40}/>

      <div style={{fontSize:12,fontWeight:500,color:D.text1,marginTop:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:94}} title={member.name}>{member.name}</div>
      <div style={{fontSize:10,color:D.text2,marginTop:2}}>{age !== null ? `${age} yrs` : "—"}</div>
      <div style={{fontSize:9,color:fg,marginTop:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:94,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",background:bg,padding:"2px 6px",borderRadius:99}} title={member.role}>{member.role}</div>
      {spouseName && (
        <div style={{display:"flex",alignItems:"center",gap:3,marginTop:5}}>
          <span style={{color:D.gold,fontSize:10}}>♥</span>
          <span style={{fontSize:10,color:D.gold,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:70}} title={spouseName}>{spouseName}</span>
        </div>
      )}
    </div>
  );
}

// ── Tree builder ─────────────────────────────────────────────────────────────
// Each unit = { member, spouse (inline, same-root only), spouseName (cross-branch),
//               childNodes: unit[], depth }
// Cross-branch spouses (different parents) stay separate under their own parents
// and show "♥ Name" labels instead. Children attach to the lower-id parent only.

function buildTree(members) {
  const byId = Object.fromEntries(members.map(m => [m.id, m]));

  // Find which root branch each member belongs to
  function findRoot(m) {
    const visited = new Set();
    let cur = m;
    while (cur) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      const p = cur.parentId != null ? byId[cur.parentId] : null;
      if (!p) return cur.id;
      cur = p;
    }
    return m.id;
  }
  const rootOf = {};
  members.forEach(m => { rootOf[m.id] = findRoot(m); });

  // Determine if two spouses share a root branch
  function sameRoot(a, b) { return rootOf[a.id] === rootOf[b.id]; }

  // Build units
  const unitOf = {};
  const units = [];
  const assigned = new Set();

  members.slice().sort((a,b) => a.id - b.id).forEach(m => {
    if (assigned.has(m.id)) return;
    assigned.add(m.id);

    let spouse = null;
    let crossSpouseName = null;
    if (m.spouseId != null && byId[m.spouseId]) {
      const s = byId[m.spouseId];
      const bothHaveParents =
        (m.parentId != null && byId[m.parentId]) &&
        (s.parentId != null && byId[s.parentId]);
      // Only treat as cross-branch if explicitly flagged as a cross-family marriage.
      // Regular couples (e.g. Helene ♥ Stein) stay inline even with different parent roots.
      const isCrossMarriage = m.crossMarriage === true || s.crossMarriage === true;
      if (bothHaveParents && !sameRoot(m, s) && isCrossMarriage) {
        // Cross-branch: don't merge, just label
        crossSpouseName = s.name;
      } else if (!assigned.has(s.id)) {
        // Same branch or at least one is a root: merge inline
        spouse = s;
        assigned.add(s.id);
      } else {
        // Spouse already assigned elsewhere
        crossSpouseName = s.name;
      }
    }

    const unit = { member: m, spouse, crossSpouseName, childNodes: [], depth: 0 };
    unitOf[m.id] = unit;
    if (spouse) unitOf[spouse.id] = unit;
    units.push(unit);
  });

  // Compute depths
  const depthOf = {};
  members.forEach(m => {
    if ((m.parentId == null || !byId[m.parentId]) &&
        (m.parent2Id == null || !byId[m.parent2Id])) {
      depthOf[m.id] = 0;
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    members.forEach(m => {
      if (depthOf[m.id] != null) return;
      const pds = [m.parentId, m.parent2Id]
        .filter(pid => pid != null && depthOf[pid] != null)
        .map(pid => depthOf[pid]);
      if (pds.length > 0) { depthOf[m.id] = Math.max(...pds) + 1; changed = true; }
    });
  }
  members.forEach(m => { if (depthOf[m.id] == null) depthOf[m.id] = 0; });
  units.forEach(u => { u.depth = depthOf[u.member.id]; });

  // Wire children: a member's children attach to the unit containing a parent
  // For cross-branch couples, children attach to the lower-id parent's unit
  const childClaimed = new Set(); // track child units to avoid duplication
  units.forEach(unit => {
    const pids = new Set([unit.member.id, ...(unit.spouse ? [unit.spouse.id] : [])]);
    const kidUnits = new Set();
    members.forEach(m => {
      if ((m.parentId != null && pids.has(m.parentId)) ||
          (m.parent2Id != null && pids.has(m.parent2Id))) {
        const cu = unitOf[m.id];
        if (cu && cu !== unit && !childClaimed.has(cu)) {
          kidUnits.add(cu);
          childClaimed.add(cu);
        }
      }
    });
    unit.childNodes = [...kidUnits].sort(
      (a,b) => (parseDate(a.member.birthdate)||0) - (parseDate(b.member.birthdate)||0)
    );
  });

  // Also set crossSpouseName on units whose spouse ended up in a different unit
  units.forEach(unit => {
    const m = unit.member;
    if (!unit.spouse && !unit.crossSpouseName && m.spouseId && byId[m.spouseId]) {
      unit.crossSpouseName = byId[m.spouseId].name;
    }
  });

  // Roots = units not claimed as a child
  return units.filter(u => !childClaimed.has(u));
}

// ── SpouseConnector — fills whatever width container it's placed in ───────────
function SpouseConnector({ m1, m2, coupleDates, onCoupleClick }) {
  const ck = m1 != null && m2 != null ? coupleKey(m1, m2) : null;
  const di = ck && coupleDates ? coupleDates[ck] : null;
  return (
    <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
      <div style={{width:44,height:2,background:D.gold}}/>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {di && (
          <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",whiteSpace:"nowrap",textAlign:"center",pointerEvents:"none",zIndex:3}}>
            <div style={{fontSize:9,color:D.text1,letterSpacing:"0.07em",textTransform:"uppercase"}}>{di.type}</div>
            <div style={{fontSize:11,fontWeight:500,color:D.text1}}>{fmtDate(di.date)}</div>
          </div>
        )}
        <div
          onClick={ck && onCoupleClick ? ()=>onCoupleClick(ck, m1, m2) : undefined}
          style={{width:36,height:36,borderRadius:"50%",background:D.goldLo,border:`2px solid ${D.gold}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#f87171",flexShrink:0,cursor:ck?"pointer":"default",transition:"transform 0.15s"}}
          onMouseEnter={e=>{if(ck)e.currentTarget.style.transform="scale(1.15)";}}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
        >♥</div>
      </div>
      <div style={{width:44,height:2,background:D.gold}}/>
    </div>
  );
}

// ── LinkedBranchView — recursive layout, no path-finding or claimBy needed ───
// secW(id): section width for one member = CARD_W leaf, or p1_w + SP_CONN + p2_w if has parents
// mCol(id, stubRight, stubLeft): renders member + full ancestry above in secW(id) px wide column.
//   stubRight/stubLeft: add gold bar from card edge to section edge on that side,
//   so the SpouseConnector lines land at the card edge.
function LinkedBranchView({ leftRoot, rightRoot, leftChild, rightChild, sharedChildren, onNodeClick, coupleDates, onCoupleClick, members }) {
  const byId = Object.fromEntries(members.map(m=>[m.id,m]));
  // Layout constants — must match FamilyTreeView sidebar constants
  const CARD_W=110, SP_CONN=124, HEART_W=80, CARD_H=130, DROP_H=28, ROW_H=CARD_H+DROP_H;
  const HALF_H = Math.floor(CARD_H/2); // 65 — card centre offset from card top

  // Section width: CARD_W for a leaf, recursive sum for a member with parents
  function secW(id) {
    const m=byId[id]; if(!m) return CARD_W;
    const p1=m.parentId&&byId[m.parentId], p2=m.parent2Id&&byId[m.parent2Id];
    return (p1&&p2) ? secW(p1.id)+SP_CONN+secW(p2.id) : CARD_W;
  }

  // Depth from the top of the tree (0 = no parents)
  function mDepth(id) {
    const m=byId[id]; if(!m||(!m.parentId&&!m.parent2Id)) return 0;
    return 1+mDepth(m.parentId||m.parent2Id);
  }

  function hasKids(id) { return members.some(m=>m.parentId===id||m.parent2Id===id); }

  // ── Core renderer ──────────────────────────────────────────────────────────
  // Returns a position:relative div of exactly  w × (CARD_H + depth*ROW_H) px.
  //
  // Every element is position:absolute so coordinates are exact:
  //   • parent cards sit at y = 0
  //   • parent SpouseConnector heart is centred at y = parentHeartY = (depth-1)*ROW_H + HALF_H
  //   • vertical drop goes from parentHeartY down ROW_H px to this card's centre
  //   • this card sits at y = depth*ROW_H  (height CARD_H, centre at depth*ROW_H + HALF_H)
  //   • horizontal stubs extend at card-centre height from card edge to section edge
  //
  // Because the drop height is always ROW_H = CARD_H + DROP_H, parent-heart-centre
  // to child-card-centre is always exactly one ROW_H apart — every line connects.
  function col(id, stubR, stubL) {
    const m=byId[id]; if(!m) return null;
    const w=secW(id);
    const sLen=Math.max(0,(w-CARD_W)/2);
    const p1=m.parentId?byId[m.parentId]:null;
    const p2=m.parent2Id?byId[m.parent2Id]:null;
    const par=!!(p1&&p2);
    const d=mDepth(id);
    const totalH=CARD_H+d*ROW_H;
    const cardTop=d*ROW_H;                          // top of this card
    const heartY=par?(d-1)*ROW_H+HALF_H:0;          // y of parent couple heart
    const p1w=p1?secW(p1.id):0;
    const p2w=p2?secW(p2.id):0;
    const ck2=par?coupleKey(p1.id,p2.id):null;
    const di2=ck2&&coupleDates?coupleDates[ck2]:null;

    return React.createElement('div',{style:{position:'relative',width:w,height:totalH}},

      // ── Left parent column ────────────────────────────────────────────────
      par&&React.createElement('div',{key:'lp',
        style:{position:'absolute',top:0,left:0,width:p1w}},
        col(p1.id,true,false)),

      // ── Right parent column ───────────────────────────────────────────────
      par&&React.createElement('div',{key:'rp',
        style:{position:'absolute',top:0,left:p1w+SP_CONN,width:p2w}},
        col(p2.id,false,true)),

      // ── SpouseConnector between parents — centred at heartY ───────────────
      // Lines are fixed 44 px each so they reach the section edges of p1/p2.
      // (For leaf parents secW=CARD_W=110; for parents-with-parents secW=344+;
      //  in both cases the stub in col(p1) ends right at x=p1w, where our left
      //  line begins — they meet exactly.)
      par&&React.createElement('div',{key:'sc',
        style:{
          position:'absolute',
          top:heartY-18,          // centre the 36 px circle at heartY
          left:p1w,
          width:SP_CONN,
          height:36,
          display:'flex',alignItems:'center',
          cursor:'pointer',
        }},
        React.createElement('div',{style:{width:44,height:2,background:D.gold}}),
        React.createElement('div',{
          onClick:()=>onCoupleClick(ck2,p1.id,p2.id),
          style:{
            position:'relative',
            width:36,height:36,borderRadius:'50%',
            background:D.goldLo,border:'2px solid '+D.gold,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:16,color:'#f87171',flexShrink:0,cursor:'pointer',
            transition:'transform 0.15s',
          }},
          di2&&React.createElement('div',{style:{
            position:'absolute',bottom:'calc(100% + 6px)',left:'50%',
            transform:'translateX(-50%)',whiteSpace:'nowrap',
            textAlign:'center',pointerEvents:'none',zIndex:3}},
            React.createElement('div',{style:{fontSize:9,color:D.text1,letterSpacing:'0.07em',textTransform:'uppercase'}},di2.type),
            React.createElement('div',{style:{fontSize:11,fontWeight:500,color:D.text1}},fmtDate(di2.date))
          ),
          '\u2665'
        ),
        React.createElement('div',{style:{width:44,height:2,background:D.gold}})
      ),

      // ── Vertical drop: from heart bottom edge down to child card centre ──
      // Starts at heartY+18 (bottom edge of the 36px circle) so the line does
      // not pass through the heart.  Still ends at cardTop+HALF_H (child
      // centre) because (heartY+18) + (ROW_H-18) = heartY+ROW_H = that point.
      par&&React.createElement('div',{key:'drop',
        style:{
          position:'absolute',
          top:heartY+18,                  // bottom edge of heart circle
          left:Math.floor(w/2),           // horizontal centre of section
          width:2,
          height:ROW_H-18,               // reaches child card centre exactly
          background:D.gold,
        }}),

      // ── This member's card + stub lines ───────────────────────────────────
      // The container is CARD_H tall; alignItems:center puts stubs at HALF_H
      // from the container top = cardTop+HALF_H from col top — same y as the
      // drop endpoint and the adjacent SpouseConnector lines.
      React.createElement('div',{key:'card',
        style:{
          position:'absolute',
          top:cardTop,
          left:0,
          width:w,
          height:CARD_H,
          display:'flex',
          alignItems:'center',
        }},
        stubL&&sLen>0
          ?React.createElement('div',{style:{width:sLen,height:2,background:D.gold}})
          :React.createElement('div',{style:{flex:1}}),
        React.createElement(TreeNode,{member:m,highlight:hasKids(id),depth:d,onClick:()=>onNodeClick(m)}),
        stubR&&sLen>0
          ?React.createElement('div',{style:{width:sLen,height:2,background:D.gold}})
          :React.createElement('div',{style:{flex:1}})
      )
    );
  }

  // ── Cross-couple row + shared children ────────────────────────────────────
  const ck=coupleKey(leftChild.member.id,rightChild.member.id);
  const di=coupleDates&&coupleDates[ck];
  const lm=leftChild.member, rm=rightChild.member;
  const leftW=secW(lm.id), rightW=secW(rm.id);
  // topOffset: how far the drop from the big heart overlaps into the cross-couple row
  // = HALF_H - heart_radius(24) so the drop starts at the heart's bottom edge
  const topOff=Math.max(0,HALF_H-24);

  return React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center'}},
    // Cross-couple row — alignItems:flex-end so big heart bottom aligns with col bottoms
    React.createElement('div',{style:{display:'flex',alignItems:'flex-end'}},
      React.createElement('div',{style:{width:leftW}},  col(lm.id,true,false)),

      // Big heart — height=CARD_H so its centre matches the cross-couple card centres
      React.createElement('div',{style:{
        width:HEART_W,height:CARD_H,
        display:'flex',alignItems:'center',
        flexShrink:0,
      }},
        React.createElement('div',{style:{width:'100%',display:'flex',alignItems:'center'}},
          React.createElement('div',{style:{flex:1,height:2,background:D.gold}}),
          React.createElement('div',{
            onClick:()=>onCoupleClick(ck,lm.id,rm.id),
            style:{
              position:'relative',
              width:48,height:48,borderRadius:'50%',
              background:D.goldLo,border:'2.5px solid '+D.gold,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:22,color:'#f87171',flexShrink:0,cursor:'pointer',
              transition:'transform 0.15s',
            },
            onMouseEnter:e=>e.currentTarget.style.transform='scale(1.12)',
            onMouseLeave:e=>e.currentTarget.style.transform='scale(1)',
          },
            di&&React.createElement('div',{style:{
              position:'absolute',bottom:'calc(100% + 8px)',left:'50%',
              transform:'translateX(-50%)',whiteSpace:'nowrap',
              textAlign:'center',pointerEvents:'none',zIndex:3}},
              React.createElement('div',{style:{fontSize:9,color:D.text1,letterSpacing:'0.07em',textTransform:'uppercase'}},di.type),
              React.createElement('div',{style:{fontSize:11,fontWeight:500,color:D.text1}},fmtDate(di.date))
            ),
            '\u2665'
          ),
          React.createElement('div',{style:{flex:1,height:2,background:D.gold}})
        )
      ),

      React.createElement('div',{style:{width:rightW}}, col(rm.id,false,true))
    ),

    sharedChildren.length>0&&React.createElement(SharedChildrenRow,{
      childNodes:sharedChildren,onNodeClick,topOffset:topOff,coupleDates,onCoupleClick,
    })
  );
}

function SharedChildrenRow({ childNodes, onNodeClick, topOffset=0, coupleDates, onCoupleClick }) {
  const CARD_W = 110;
  const GAP = 20;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:-topOffset}}>
      <div style={{width:2,height:28+topOffset,background:D.gold}}/>
      {childNodes.length === 1 ? (
        <TreeUnit unit={childNodes[0]} onNodeClick={onNodeClick} hasChildren={childNodes[0].childNodes.length>0} coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
      ) : (
        <div style={{display:"flex",justifyContent:"center"}}>
          <div style={{position:"relative",display:"inline-flex",gap:GAP,alignItems:"flex-start"}}>
            <div style={{
              position:"absolute",top:0,left:CARD_W/2,
              width:childNodes.length*CARD_W+(childNodes.length-1)*GAP-CARD_W,
              height:2,background:D.gold,
            }}/>
            {childNodes.map(child => (
              <div key={child.member.id} style={{display:"flex",flexDirection:"column",alignItems:"center",width:CARD_W}}>
                <div style={{width:2,height:20,background:D.gold}}/>
                <TreeUnit unit={child} onNodeClick={onNodeClick} hasChildren={child.childNodes.length>0} coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TreeUnit — one couple (or solo member) + their subtree ───────────────────
function TreeUnit({ unit, onNodeClick, hasChildren, coupleDates, onCoupleClick }) {
  const { member, spouse, crossSpouseName, childNodes, depth } = unit;
  const CARD_W = 110, GAP = 20;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center"}}>
        <TreeNode member={member} highlight={hasChildren} depth={depth}
          onClick={()=>onNodeClick(member)} spouseName={crossSpouseName}/>
        {spouse && (
          <>
            <SpouseConnector m1={member.id} m2={spouse.id} coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
            <TreeNode member={spouse} highlight={hasChildren} depth={depth}
              onClick={()=>onNodeClick(spouse)}/>
          </>
        )}
      </div>
      {childNodes.length > 0 && (
        <>
          <div style={{width:2,height:28,background:D.gold}}/>
          {childNodes.length === 1 ? (
            <TreeUnit unit={childNodes[0]} onNodeClick={onNodeClick}
              hasChildren={childNodes[0].childNodes.length>0}
              coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
          ) : (
            <div style={{display:"flex",justifyContent:"center"}}>
              <div style={{position:"relative",display:"inline-flex",gap:GAP,alignItems:"flex-start"}}>
                <div style={{position:"absolute",top:0,left:CARD_W/2,
                  width:childNodes.length*CARD_W+(childNodes.length-1)*GAP-CARD_W,
                  height:2,background:D.gold}}/>
                {childNodes.map(child=>(
                  <div key={child.member.id} style={{display:"flex",flexDirection:"column",alignItems:"center",width:CARD_W}}>
                    <div style={{width:2,height:20,background:D.gold}}/>
                    <TreeUnit unit={child} onNodeClick={onNodeClick}
                      hasChildren={child.childNodes.length>0}
                      coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Couple row + children in a single flex column — guarantees children center
// aligns with the midpoint of the marriage bar.
function CoupleWithChildren({ left, right, childNodes, onNodeClick, coupleDates, onCoupleClick }) {
  const CARD_W = 110;
  const GAP = 20;

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      {/* Couple row */}
      <div style={{display:"flex",alignItems:"center"}}>
        <TreeNode member={left} highlight onClick={()=>onNodeClick(left)}/>
        <SpouseConnector m1={left.id} m2={right.id} coupleDates={coupleDates} onCoupleClick={onCoupleClick}/>
        <TreeNode member={right} highlight onClick={()=>onNodeClick(right)}/>
      </div>

      {/* Children */}
      {childNodes.length > 0 && (
        <>
          <div style={{width:2,height:28,background:D.gold}}/>
          {childNodes.length === 1 ? (
            <TreeUnit unit={childNodes[0]} onNodeClick={onNodeClick} hasChildren={childNodes[0].childNodes.length>0}/>
          ) : (
            <div style={{display:"flex",justifyContent:"center"}}>
              <div style={{position:"relative",display:"inline-flex",gap:GAP,alignItems:"flex-start"}}>
                {/* Horizontal bar from center of first to center of last child */}
                <div style={{
                  position:"absolute",top:0,
                  left:CARD_W/2,
                  width:childNodes.length*CARD_W+(childNodes.length-1)*GAP-CARD_W,
                  height:2,background:D.gold,
                }}/>
                {childNodes.map(child => (
                  <div key={child.member.id} style={{display:"flex",flexDirection:"column",alignItems:"center",width:CARD_W}}>
                    <div style={{width:2,height:20,background:D.gold}}/>
                    <TreeUnit unit={child} onNodeClick={onNodeClick} hasChildren={child.childNodes.length>0}/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Family Tree View ──────────────────────────────────────────────────────────
function FamilyTreeView({ members, onNodeClick, coupleDates, onCoupleClick, onAddGeneration, onRemoveGeneration }) {
  const roots = buildTree(members);
  const byId = Object.fromEntries(members.map(m => [m.id, m]));

  // Collect all units in a flat map by member id
  const unitMap = {};
  function mapUnits(u) {
    unitMap[u.member.id] = u;
    if (u.spouse) unitMap[u.spouse.id] = u;
    u.childNodes.forEach(mapUnits);
  }
  roots.forEach(mapUnits);

  // Detect linked root pairs: two roots whose child-level units form a cross-couple
  // A cross-couple: unit A has crossSpouseName pointing to a member in unit B (different root)
  const linked = new Set();    // root indices that have been linked
  const linkedGroups = [];     // {leftRoot, rightRoot, leftChild, rightChild, sharedChildren}

  for (let i = 0; i < roots.length; i++) {
    if (linked.has(i)) continue;
    for (let j = i + 1; j < roots.length; j++) {
      if (linked.has(j)) continue;

      // Find all leaf-level units with crossSpouseName in each root
      function findCrossUnits(root) {
        const result = [];
        function walk(u) {
          if (u.crossSpouseName) result.push(u);
          u.childNodes.forEach(walk);
        }
        walk(root);
        return result;
      }

      const crossA = findCrossUnits(roots[i]);
      const crossB = findCrossUnits(roots[j]);

      // Check if any cross-unit in A points to a member in B's tree and vice versa
      let match = null;
      for (const a of crossA) {
        const aSpouseId = a.member.spouseId;
        if (!aSpouseId || !unitMap[aSpouseId]) continue;
        for (const b of crossB) {
          if (b.member.id === aSpouseId) {
            // Found a cross-couple between root i and root j
            const sharedChildren = a.childNodes.length > 0 ? a.childNodes : b.childNodes;
            match = { leftChild: a, rightChild: b, sharedChildren };
            break;
          }
        }
        if (match) break;
      }

      if (match) {
        linked.add(i);
        linked.add(j);
        linkedGroups.push({
          leftRoot: roots[i],
          rightRoot: roots[j],
          leftChild: match.leftChild,
          rightChild: match.rightChild,
          sharedChildren: match.sharedChildren,
        });
      }
    }
  }

  // Collect every ancestor member-id reachable from the cross-couple members.
  // These units are already drawn recursively inside LinkedBranchView's col()
  // so rendering them again as separate floating roots causes duplicate cards.
  const lbvAncestors = new Set();
  function collectAncestors(id) {
    if (!id || lbvAncestors.has(id)) return;
    const m = byId[id]; if (!m) return;
    lbvAncestors.add(id);
    collectAncestors(m.parentId);
    collectAncestors(m.parent2Id);
  }
  linkedGroups.forEach(g => {
    collectAncestors(g.leftChild.member.id);
    collectAncestors(g.rightChild.member.id);
  });

  // Unlinked roots: skip units already rendered inside LinkedBranchView
  const unlinkedRoots = roots.filter((_, idx) => !linked.has(idx))
    .filter(unit => !lbvAncestors.has(unit.member.id));

  // Compute max tree depth to drive the gen-label sidebar
  const CARD_H = 130, DROP_H = 28;
  let maxDepth = 0;
  function walkDepth(u) { maxDepth = Math.max(maxDepth, u.depth); u.childNodes.forEach(walkDepth); }
  roots.forEach(walkDepth);
  const numGen = maxDepth + 1;

  const BTN_H = 44; // +GEN button area height — tree gets matching paddingTop
  // Gen sidebar: one label per generation row, aligned to the card rows in the tree
  const genSidebar = (
    <div style={{flexShrink:0, position:"sticky", left:0, zIndex:2, paddingLeft:20, paddingRight:18}}>
      {/* + Gen and – Gen buttons */}
      <div style={{display:"flex",flexDirection:"column",gap:6,paddingBottom:4}}>
        <div style={{height:BTN_H, display:"flex", alignItems:"center"}}>
          <button
            onClick={onAddGeneration}
            title="Add a new generation above Gen 1"
            style={{
              padding:"5px 10px", fontSize:11, fontWeight:700,
              letterSpacing:"0.08em", textTransform:"uppercase",
              background:D.bg3, color:D.gold,
              border:`1px solid ${D.gold}55`,
              borderRadius:6, cursor:"pointer", lineHeight:1,
              transition:"all 0.15s", whiteSpace:"nowrap",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background=D.goldLo;e.currentTarget.style.borderColor=D.gold;}}
            onMouseLeave={e=>{e.currentTarget.style.background=D.bg3;e.currentTarget.style.borderColor=D.gold+'55';}}
          >+ Gen</button>
        </div>
        <div style={{height:BTN_H, display:"flex", alignItems:"center"}}>
          <button
            onClick={onRemoveGeneration}
            title="Remove the top generation (Gen 1)"
            style={{
              padding:"5px 10px", fontSize:11, fontWeight:700,
              letterSpacing:"0.08em", textTransform:"uppercase",
              background:D.bg3, color:D.red,
              border:`1px solid ${D.red}55`,
              borderRadius:6, cursor:"pointer", lineHeight:1,
              transition:"all 0.15s", whiteSpace:"nowrap",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="#f8717118";e.currentTarget.style.borderColor=D.red;}}
            onMouseLeave={e=>{e.currentTarget.style.background=D.bg3;e.currentTarget.style.borderColor=D.red+'55';}}
          >– Gen</button>
        </div>
      </div>
      {Array.from({length:numGen}, (_,i) => {
        const isLast = i === numGen - 1;
        return (
          <div key={i} style={{height: isLast ? CARD_H : CARD_H + DROP_H}}>
            <div style={{height:CARD_H, display:"flex", alignItems:"center"}}>
              <div style={{
                fontSize:10, fontWeight:700, letterSpacing:"0.13em",
                textTransform:"uppercase", color:D.text3, lineHeight:1,
                whiteSpace:"nowrap",
              }}>Gen {i + 1}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{overflowX:"auto", paddingBottom:24, paddingRight:24}}>
      <div style={{display:"flex", alignItems:"flex-start", minWidth:"max-content"}}>
        {genSidebar}
        <div style={{display:"flex", gap:56, alignItems:"flex-start", justifyContent:"center", flex:1, paddingTop:BTN_H*2+6}}>
          {linkedGroups.map(g => (
            <LinkedBranchView
              key={g.leftRoot.member.id}
              leftRoot={g.leftRoot}
              rightRoot={g.rightRoot}
              leftChild={g.leftChild}
              rightChild={g.rightChild}
              sharedChildren={g.sharedChildren}
              onNodeClick={onNodeClick}
              coupleDates={coupleDates}
              onCoupleClick={onCoupleClick}
              members={members}
            />
          ))}
          {unlinkedRoots.map(unit => (
            <TreeUnit
              key={unit.member.id}
              unit={unit}
              onNodeClick={onNodeClick}
              hasChildren={unit.childNodes.length>0}
              coupleDates={coupleDates}
              onCoupleClick={onCoupleClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── FamilySetup modal ────────────────────────────────────────────────────────
function FamilySetup({ currentCode, onCode, onClose }) {
  const [tab, setTab]       = useState(currentCode ? 'current' : 'create');
  const [input, setInput]   = useState('');
  const [newCode]           = useState(generateCode);
  const [copied, setCopied] = useState(false);

  const codeDisplay = currentCode || newCode;

  const tabBtn = (t, lbl) => (
    <button key={t} onClick={()=>setTab(t)} style={{
      flex:1, padding:"7px", fontSize:12, fontWeight:600, borderRadius:6,
      cursor:"pointer", border:"none", transition:"all 0.15s",
      background: tab===t ? D.blue : "transparent",
      color:      tab===t ? D.text1 : D.text3,
    }}>{lbl}</button>
  );

  const codeBox = (code) => (
    <div style={{
      textAlign:"center", fontSize:22, fontWeight:700, letterSpacing:"0.12em",
      color:D.gold, padding:"16px", background:D.bg3, borderRadius:8,
      border:`1px solid ${D.border}`, marginTop:12, fontFamily:"monospace",
      userSelect:"all",
    }}>{code}</div>
  );

  const primaryBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", padding:"11px", marginTop:16, fontSize:13, fontWeight:600,
      borderRadius:8, cursor: disabled ? "default" : "pointer",
      border:`1px solid ${D.gold}`, background: disabled ? D.bg3 : D.goldLo,
      color: disabled ? D.text3 : D.gold, transition:"all 0.15s",
    }}>{label}</button>
  );

  const note = (txt) => (
    <p style={{color:D.text3, fontSize:11, marginTop:8, textAlign:"center", lineHeight:1.5}}>{txt}</p>
  );

  return (
    <Modal title="Family Space" onClose={onClose}>
      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,background:D.bg3,borderRadius:8,padding:4}}>
        {currentCode
          ? [tabBtn('current','Your code'), tabBtn('switch','Switch family')]
          : [tabBtn('create','New family'), tabBtn('join','Join family')]}
      </div>

      {/* Create */}
      {tab==='create' && (<>
        <p style={{color:D.text2,fontSize:13,lineHeight:1.6}}>
          A unique code has been generated for your family. Share it with family
          members so everyone can access the same data.
        </p>
        {codeBox(newCode)}
        {note('Save this code — everyone who joins needs it.')}
        {primaryBtn('Create family with this code', ()=>onCode(newCode))}
      </>)}

      {/* Join */}
      {tab==='join' && (<>
        <p style={{color:D.text2,fontSize:13,lineHeight:1.6}}>
          Enter the code shared with you to access your family's data.
        </p>
        <input
          value={input}
          onChange={e=>setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,''))}
          placeholder="XXXX-XXXX-XXXX"
          autoFocus
          style={{
            width:"100%", textAlign:"center", fontSize:20, letterSpacing:"0.14em",
            padding:"12px", marginTop:12, borderRadius:8, fontFamily:"monospace",
            background:D.bg3, border:`1px solid ${D.border}`, color:D.text1,
          }}
        />
        {primaryBtn('Join family', ()=>onCode(input), input.length < 3)}
      </>)}

      {/* Current code */}
      {tab==='current' && currentCode && (<>
        <p style={{color:D.text2,fontSize:13,lineHeight:1.6}}>
          Share this code with family members so they can join your family space.
        </p>
        {codeBox(currentCode)}
        {primaryBtn(copied ? '✓ Copied!' : 'Copy code', ()=>{
          navigator.clipboard?.writeText(currentCode);
          setCopied(true);
          setTimeout(()=>setCopied(false), 2000);
        })}
      </>)}

      {/* Switch family */}
      {tab==='switch' && (<>
        <p style={{color:D.text2,fontSize:13,lineHeight:1.6}}>
          Switch to a different family space. Your current data stays in the cloud
          and can be rejoined with its code.
        </p>
        <input
          value={input}
          onChange={e=>setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,''))}
          placeholder="Enter a family code"
          autoFocus
          style={{
            width:"100%", textAlign:"center", fontSize:20, letterSpacing:"0.14em",
            padding:"12px", marginTop:12, borderRadius:8, fontFamily:"monospace",
            background:D.bg3, border:`1px solid ${D.border}`, color:D.text1,
          }}
        />
        {primaryBtn('Switch to this family', ()=>onCode(input), input.length < 3)}
      </>)}
    </Modal>
  );
}

export default function App() {
  const [members, setMembers] = useState(() => {
    try {
      if (localStorage.getItem(VERSION_KEY) !== STORAGE_VERSION) {
        localStorage.setItem(VERSION_KEY, STORAGE_VERSION);
        localStorage.removeItem(STORAGE_KEY);
        return DEFAULT_MEMBERS;
      }
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s);
    } catch {}
    return DEFAULT_MEMBERS;
  });
  const [nextId,       setNextId]       = useState(()=>Math.max(...DEFAULT_MEMBERS.map(m=>m.id))+1);
  const [coupleDates,  setCoupleDates]  = useState(()=>{try{const s=localStorage.getItem("family-birthdays-couples");if(s)return JSON.parse(s);}catch{}return{};});
  const [coupleModal,  setCoupleModal]  = useState(null);
  const [view,         setView]         = useState("cards");
  const [search,       setSearch]       = useState("");
  const [sortBy,       setSortBy]       = useState("birthday");
  const [editing,      setEditing]      = useState(null);
  const [treeAnchor,   setTreeAnchor]   = useState(null);
  const [treeZoom,     setTreeZoom]     = useState(1);

  // ── Cloud sync state ────────────────────────────────────────────────────────
  const [familyCode, setFamilyCodeRaw] = useState(() =>
    WORKER_URL ? (localStorage.getItem(CODE_KEY) || '') : ''
  );
  const [showSetup,  setShowSetup]  = useState(() =>
    !!WORKER_URL && !localStorage.getItem(CODE_KEY)
  );
  const [syncStatus, setSyncStatus] = useState('idle');
  // 'idle' | 'pending' | 'syncing' | 'synced' | 'error' | 'offline'

  const syncTimerRef    = useRef(null);
  const skipSyncUntil   = useRef(0);   // timestamp — skip push if Date.now() < this
  const latestDataRef   = useRef(null); // always-current snapshot for polling

  function applyCode(code) {
    localStorage.setItem(CODE_KEY, code);
    setFamilyCodeRaw(code);
    setShowSetup(false);
  }
  const [treeLinkType, setTreeLinkType] = useState(null);

  useEffect(()=>{ try { localStorage.setItem(STORAGE_KEY,JSON.stringify(members)); } catch {} },[members]);
  useEffect(()=>{ try { localStorage.setItem("family-birthdays-couples",JSON.stringify(coupleDates)); } catch {} },[coupleDates]);

  function onCoupleClick(ck, m1, m2) {
    const byId = Object.fromEntries(members.map(m=>[m.id,m]));
    const a=byId[m1]; const b=byId[m2];
    setCoupleModal({ ck, name: a&&b?`${a.name} & ${b.name}`:"Couple", m1, m2 });
  }
  function saveCoupleDate(ck, data) {
    setCoupleDates(prev=>{if(!data){const n={...prev};delete n[ck];return n;}return{...prev,[ck]:data};});
    setCoupleModal(null);
  }
  function saveMember(data) { setMembers(ms=>ms.map(m=>m.id===editing.id?{...m,...data}:m)); setEditing(null); }
  function deleteMember(id) {
    setMembers(ms=>ms.filter(m=>m.id!==id).map(m=>({...m,
      parentId:m.parentId===id?null:m.parentId,
      parent2Id:m.parent2Id===id?null:m.parent2Id,
      spouseId:m.spouseId===id?null:m.spouseId,
    })));
  }
  // Returns depth of a member (0 = root) by walking up parentId chain
  function memberDepth(id, ms) {
    const byId = Object.fromEntries(ms.map(m=>[m.id,m]));
    let cur = byId[id]; let d = 0;
    while (cur && (cur.parentId || cur.parent2Id)) {
      cur = byId[cur.parentId || cur.parent2Id]; d++;
    }
    return d;
  }

  function addRelative(data) {
    const anchor   = treeAnchor;
    const linkType = treeLinkType;
    let idCursor   = nextId;

    if (linkType === "parent") {
      // Hard rule: every member at the same generation must have two parents.
      // Auto-create a parent couple for EVERY member at this depth that has none.
      const anchorDepth = memberDepth(anchor.id, members);

      // Named parent + blank spouse for the clicked member
      const namedId = idCursor++;
      const blankId = idCursor++;
      const namedParent = { id:namedId, parentId:null, parent2Id:null, spouseId:blankId, imageUrl:null, ...data };
      const blankParent = { id:blankId, name:"?", role:"Unknown", birthdate:"",
                            parentId:null, parent2Id:null, spouseId:namedId,
                            imageUrl:null, placeholder:true, childName:anchor.name, parentRole:"mother" };

      // For all other members at the same depth with no parents: create blank parent couples
      const sameGenOthers = members.filter(m =>
        m.id !== anchor.id && !m.placeholder &&
        !m.parentId && !m.parent2Id &&
        memberDepth(m.id, members) === anchorDepth
      );
      const extraPairs = sameGenOthers.map(other => {
        const p1Id = idCursor++; const p2Id = idCursor++;
        return {
          memberId: other.id,
          p1: { id:p1Id, name:"?", role:"Unknown", birthdate:"", parentId:null, parent2Id:null, spouseId:p2Id, imageUrl:null, placeholder:true, childName:other.name, parentRole:"father" },
          p2: { id:p2Id, name:"?", role:"Unknown", birthdate:"", parentId:null, parent2Id:null, spouseId:p1Id, imageUrl:null, placeholder:true, childName:other.name, parentRole:"mother" },
        };
      });

      setMembers(ms => {
        const allNew = [namedParent, blankParent, ...extraPairs.flatMap(p => [p.p1, p.p2])];
        let updated = [...ms, ...allNew];
        updated = updated.map(m => {
          if (m.id === anchor.id) return { ...m, parentId:namedId, parent2Id:blankId };
          const pair = extraPairs.find(p => p.memberId === m.id);
          return pair ? { ...m, parentId:pair.p1.id, parent2Id:pair.p2.id } : m;
        });
        return updated;
      });
      setNextId(idCursor);
    }
    else {
      let newMember = { id:nextId, parentId:null, parent2Id:null, spouseId:null, imageUrl:null, ...data };
      let anchorPatch = {};
      if (linkType === "child")  { newMember = { ...newMember, parentId:anchor.id, ...(anchor.spouseId?{parent2Id:anchor.spouseId}:{}) }; }
      // "spouse" is blocked by LinkPicker — guard here for safety
    if (linkType === "spouse") { newMember = { ...newMember, spouseId:anchor.id, crossMarriage:true }; anchorPatch = { spouseId:nextId, crossMarriage:true }; }
      setMembers(ms => {
        const updated = [...ms, newMember];
        return Object.keys(anchorPatch).length > 0 ? updated.map(m=>m.id===anchor.id?{...m,...anchorPatch}:m) : updated;
      });
      setNextId(n=>n+1);
    }

    setTreeAnchor(null);
    setTreeLinkType(null);
  }
  // Remove the entire current top row (Gen 1) and make Gen 2 the new Gen 1
  function removeTopGeneration() {
    const byId = Object.fromEntries(members.map(m=>[m.id,m]));
    // Gen 1 = members whose parents are absent from the tree
    const topIds = new Set(
      members
        .filter(m =>
          (!m.parentId  || !byId[m.parentId])  &&
          (!m.parent2Id || !byId[m.parent2Id])
        )
        .map(m => m.id)
    );
    if (topIds.size === 0) return;
    // Safety: don't let user delete past the cross-couple row
    // (check that at least one non-top member would survive as the new root)
    const survivors = members.filter(m => !topIds.has(m.id));
    const anyNewRoot = survivors.some(m =>
      (topIds.has(m.parentId) || !m.parentId) &&
      (topIds.has(m.parent2Id) || !m.parent2Id)
    );
    if (!anyNewRoot) return; // nothing would remain — don't remove
    setMembers(ms =>
      ms
        .filter(m => !topIds.has(m.id))
        .map(m => ({
          ...m,
          parentId:  topIds.has(m.parentId)  ? null : m.parentId,
          parent2Id: topIds.has(m.parent2Id) ? null : m.parent2Id,
          spouseId:  topIds.has(m.spouseId)  ? null : m.spouseId,
        }))
    );
  }

  function closeTreeFlow() { setTreeAnchor(null); setTreeLinkType(null); }

  // ── Keep latestDataRef in sync for polling ────────────────────────────────
  useEffect(() => { latestDataRef.current = { members, coupleDates, nextId }; },
    [members, coupleDates, nextId]);

  // ── Load from Worker when familyCode first becomes known ───────────────────
  useEffect(() => {
    if (!WORKER_URL || !familyCode) return;
    setSyncStatus('syncing');
    fetch(`${WORKER_URL}/family/${familyCode}`)
      .then(r => r.status === 404 ? null : r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (data?.members) {
          skipSyncUntil.current = Date.now() + 1500;
          setMembers(data.members);
          setCoupleDates(data.coupleDates || {});
          setNextId(data.nextId || nextId);
        }
        setSyncStatus('synced');
      })
      .catch(() => setSyncStatus('error'));
  }, [familyCode]); // eslint-disable-line

  // ── Push to Worker 2 s after any data change (debounced) ───────────────────
  useEffect(() => {
    if (!WORKER_URL || !familyCode) return;
    if (Date.now() < skipSyncUntil.current) return;
    const snap = { members, coupleDates, nextId, updatedAt: Date.now() };
    clearTimeout(syncTimerRef.current);
    setSyncStatus('pending');
    syncTimerRef.current = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        const res = await fetch(`${WORKER_URL}/family/${familyCode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snap),
        });
        setSyncStatus(res.ok ? 'synced' : 'error');
      } catch {
        setSyncStatus('offline');
      }
    }, 2000);
  }, [members, coupleDates, nextId]); // eslint-disable-line

  // ── Poll for remote changes every 30 s ─────────────────────────────────────
  useEffect(() => {
    if (!WORKER_URL || !familyCode) return;
    const poll = async () => {
      if (document.hidden || Date.now() < skipSyncUntil.current) return;
      try {
        const res = await fetch(`${WORKER_URL}/family/${familyCode}`);
        if (!res.ok) return;
        const data = await res.json();
        const cur  = latestDataRef.current;
        if (!cur) return;
        if (JSON.stringify(data.members)     !== JSON.stringify(cur.members) ||
            JSON.stringify(data.coupleDates) !== JSON.stringify(cur.coupleDates)) {
          skipSyncUntil.current = Date.now() + 1500;
          setMembers(data.members);
          setCoupleDates(data.coupleDates || {});
          setNextId(data.nextId || cur.nextId);
          setSyncStatus('synced');
        }
      } catch {}
    };
    const id = setInterval(poll, 30_000);
    document.addEventListener('visibilitychange', poll);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', poll); };
  }, [familyCode]); // eslint-disable-line

  // Add a new blank generation above the current topmost (Gen 1) members
  function addGenerationAbove() {
    const byId = Object.fromEntries(members.map(m=>[m.id,m]));
    // Gen 1 = all members (including placeholders) with no parents in the tree
    const gen1 = members.filter(m =>
      (!m.parentId  || !byId[m.parentId]) &&
      (!m.parent2Id || !byId[m.parent2Id])
    );
    if (gen1.length === 0) return;

    let idCursor = nextId;
    const newMembers = [];
    const updates = {};

    for (const m of gen1) {
      const p1Id = idCursor++, p2Id = idCursor++;
      newMembers.push(
        { id:p1Id, name:"?", role:"Unknown", birthdate:"", parentId:null, parent2Id:null,
          spouseId:p2Id, imageUrl:null, placeholder:true, childName:m.name, parentRole:"father" },
        { id:p2Id, name:"?", role:"Unknown", birthdate:"", parentId:null, parent2Id:null,
          spouseId:p1Id, imageUrl:null, placeholder:true, childName:m.name, parentRole:"mother" }
      );
      updates[m.id] = { parentId:p1Id, parent2Id:p2Id };
    }

    setMembers(ms => {
      const updated = ms.map(m => updates[m.id] ? {...m, ...updates[m.id]} : m);
      return [...updated, ...newMembers];
    });
    setNextId(idCursor);
  }

  const filtered = members
    .filter(m=>!m.placeholder)
    .filter(m=>m.name.toLowerCase().includes(search.toLowerCase())||m.role.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      if(sortBy==="name")    return a.name.localeCompare(b.name);
      if(sortBy==="age")     return (parseDate(a.birthdate)||0)-(parseDate(b.birthdate)||0);
      if(sortBy==="ageDesc") return (parseDate(b.birthdate)||0)-(parseDate(a.birthdate)||0);
      return (nextBday(a.birthdate)||0)-(nextBday(b.birthdate)||0);
    });

  const TAB = (v,icon,lbl) => (
    <button onClick={()=>setView(v)} style={{
      display:"flex",alignItems:"center",gap:7,padding:"7px 16px",fontSize:13,fontWeight:500,
      background: view===v ? D.blueLo : "transparent",
      color: view===v ? D.ice : D.text2,
      border: view===v ? `1px solid ${D.blue}55` : `1px solid transparent`,
      borderRadius:8,cursor:"pointer",transition:"all 0.15s",
    }}>
      <i className={`ti ${icon}`} style={{fontSize:15}} aria-hidden="true"/> {lbl}
    </button>
  );

  const addFormTitle = treeAnchor && treeLinkType && {
    parent:  `Add a parent of ${treeAnchor.name}`,
    child:   `Add a child of ${treeAnchor.name}`,
    spouse:  `Add a spouse of ${treeAnchor.name}`,
  }[treeLinkType];

  return (
    <div style={{minHeight:"100vh",fontFamily:"var(--font-sans)",color:D.text1,position:"relative"}}>
      <FrostBackground/>

      {/* Content sits above the background */}
      <div style={{position:"relative",zIndex:1,padding:"24px 20px 32px"}}>
        <h2 className="sr-only">Family birthday tracker</h2>

        <style>{`
          @keyframes todaypulse{0%,100%{opacity:1}50%{opacity:0.55}}
          .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;max-width:1400px;margin:0 auto}
          input::placeholder{color:${D.text3}}
          select option{background:${D.bg2};color:${D.text1}}
        `}</style>

        {/* ── Header + Nav (single centered row) ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:22,flexWrap:"wrap"}}>
          {/* Swedish cross accent + title */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:4,height:28,background:D.gold,borderRadius:2,flexShrink:0}}/>
            <div style={{width:20,height:4,background:D.gold,borderRadius:2,marginLeft:-6,flexShrink:0}}/>
            <div style={{fontSize:24,fontWeight:500,color:D.text1,letterSpacing:"-0.02em",lineHeight:1}}>
              Family <span style={{color:D.gold}}>Birthdays</span>
            </div>
          </div>

          {/* Nav tabs */}
          <div style={{display:"flex",gap:6,padding:"4px",background:D.bgGlass,backdropFilter:"blur(8px)",borderRadius:10,border:`1px solid ${D.border}`}}>
            {TAB("cards","ti-users","Birthday cards")}
            {TAB("tree","ti-hierarchy","Family tree")}
          </div>

          {/* Sync indicator + family code chip (only when Worker is configured) */}
          {WORKER_URL && familyCode && (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{
                fontSize:11,letterSpacing:"0.04em",
                color: syncStatus==='synced'  ? D.gold :
                       syncStatus==='error' || syncStatus==='offline' ? D.red : D.text3,
                transition:"color 0.3s",
              }}>
                {syncStatus==='synced'  && '✓ synced'}
                {syncStatus==='pending' && '· pending'}
                {syncStatus==='syncing' && '↻ syncing…'}
                {syncStatus==='error'   && '⚠ sync error'}
                {syncStatus==='offline' && '⚡ offline'}
              </span>
              <button
                onClick={()=>setShowSetup(true)}
                title={`Family code: ${familyCode} — click to manage`}
                style={{
                  fontSize:10,padding:"3px 8px",borderRadius:5,cursor:"pointer",
                  background:D.bg3,color:D.text3,
                  border:`1px solid ${D.border}`,
                  letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,
                }}
              >{familyCode.slice(0,4)}…</button>
            </div>
          )}
          {WORKER_URL && !familyCode && (
            <button onClick={()=>setShowSetup(true)} style={{
              fontSize:11,padding:"5px 12px",borderRadius:6,cursor:"pointer",
              background:D.goldLo,color:D.gold,border:`1px solid ${D.gold}55`,fontWeight:600,
            }}>Set up family</button>
          )}
        </div>

        {/* ── Cards view ── */}
        {view==="cards" && (<>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:160}}>
              <i className="ti ti-search" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:14,color:D.text3,pointerEvents:"none"}} aria-hidden="true"/>
              <input type="text" placeholder="Search name or role…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{width:"100%",boxSizing:"border-box",padding:"9px 10px 9px 34px",fontSize:13,border:`1px solid ${D.borderHi}`,borderRadius:8,background:D.bgGlass,backdropFilter:"blur(8px)",color:D.text1,outline:"none"}}/>
            </div>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:"9px 12px",fontSize:13,border:`1px solid ${D.borderHi}`,borderRadius:8,background:D.bg2,color:D.text1,cursor:"pointer",outline:"none"}}>
              <option value="birthday">Next birthday</option>
              <option value="age">Age (oldest first)</option>
              <option value="ageDesc">Age (youngest first)</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
          {filtered.length===0 ? (
            <div style={{textAlign:"center",padding:"56px 16px",color:D.text3}}>
              <i className="ti ti-users" style={{fontSize:44,display:"block",marginBottom:14}} aria-hidden="true"/>
              <div style={{fontSize:16,fontWeight:500,color:D.text2,marginBottom:6}}>{search?"No members found":"No family members yet"}</div>
              <div style={{fontSize:13}}>{search?"Try a different search.":"Go to the Family tree tab and click any member to add relatives."}</div>
            </div>
          ) : (
            <div className="card-grid">
              {filtered.map(m=><BirthdayCard key={m.id} member={m} onEdit={setEditing} onDelete={deleteMember}/>)}
            </div>
          )}
        </>)}

        {/* ── Tree view ── */}
        {view==="tree" && (
          <div>
            {/* ── Zoom controls ── */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 20px 10px",justifyContent:"center"}}>
              <button
                onClick={()=>setTreeZoom(z=>Math.max(0.2,Math.round((z-0.1)*10)/10))}
                disabled={treeZoom<=0.2}
                title="Zoom out"
                style={{
                  width:28,height:28,borderRadius:6,border:`1px solid ${D.borderHi}`,
                  background:D.bg3,color:treeZoom<=0.2?D.text3:D.text1,
                  fontSize:16,cursor:treeZoom<=0.2?"default":"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"all 0.15s",flexShrink:0,
                }}
              >−</button>
              <span
                onClick={()=>setTreeZoom(1)}
                title="Reset zoom"
                style={{
                  minWidth:44,textAlign:"center",fontSize:12,
                  color:D.text2,cursor:"pointer",userSelect:"none",
                  fontVariantNumeric:"tabular-nums",letterSpacing:"0.02em",
                }}
              >{Math.round(treeZoom*100)}%</span>
              <button
                onClick={()=>setTreeZoom(z=>Math.min(3,Math.round((z+0.1)*10)/10))}
                disabled={treeZoom>=3}
                title="Zoom in"
                style={{
                  width:28,height:28,borderRadius:6,border:`1px solid ${D.borderHi}`,
                  background:D.bg3,color:treeZoom>=3?D.text3:D.text1,
                  fontSize:16,cursor:treeZoom>=3?"default":"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"all 0.15s",flexShrink:0,
                }}
              >+</button>
            </div>
            {/* ── Tree canvas ── */}
            <div style={{overflow:"auto",paddingBottom:8}}>
              <div style={{
                transform:`scale(${treeZoom})`,
                transformOrigin:"top left",
                transition:"transform 0.15s ease",
                width:`${Math.round(100/treeZoom)}%`,
              }}>
                <FamilyTreeView onRemoveGeneration={removeTopGeneration} members={members} onNodeClick={m=>{
                    if (m.placeholder) { setEditing(m); }
                    else { setTreeAnchor(m); setTreeLinkType(null); }
                  }} coupleDates={coupleDates} onCoupleClick={onCoupleClick} onAddGeneration={addGenerationAbove}/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Family setup / code modal ── */}
      {showSetup && WORKER_URL && (
        <FamilySetup
          currentCode={familyCode || null}
          onCode={applyCode}
          onClose={familyCode ? ()=>setShowSetup(false) : null}
        />
      )}

      {/* ── Modals ── */}
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={()=>setEditing(null)}>
          <MemberForm initial={editing} onSave={saveMember} onCancel={()=>setEditing(null)}/>
        </Modal>
      )}
      {coupleModal && (
        <CoupleModal ckKey={coupleModal.ck} coupleName={coupleModal.name}
          existing={coupleDates[coupleModal.ck]} onSave={saveCoupleDate} onClose={()=>setCoupleModal(null)}/>
      )}
      {treeAnchor && !treeLinkType && (
        <LinkPicker
          anchor={treeAnchor}
          canAddParent={!treeAnchor.parentId && !treeAnchor.parent2Id}
          canAddChild={treeAnchor.crossMarriage === true}
          onPick={type=>setTreeLinkType(type)}
          onClose={closeTreeFlow}
          onRemove={()=>{ if(confirm(`Remove ${treeAnchor.name} from the family?`)) { deleteMember(treeAnchor.id); closeTreeFlow(); } }}
        />
      )}
      {treeAnchor && treeLinkType && (
        <Modal title={addFormTitle} subtitle="Fill in the details for the new family member" onClose={closeTreeFlow}>
          <MemberForm onSave={addRelative} onCancel={closeTreeFlow}/>
        </Modal>
      )}
    </div>
  );
}
