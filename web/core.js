/* Message constructor. Pure tree model; XML parsing uses the browser DOM. */
(function(global){
'use strict';
let serial=0;
const types=['object','array','string','number','integer','boolean','date','dateTime','null'];
function node(name='field',type='string',extra={}){return {id:'n'+(++serial),name,type,len:'',digits:'',scale:'',required:false,value:'',description:'',source:'',xmlAttribute:false,children:[],...extra};}
function walk(n,fn){fn(n);n.children.forEach(c=>walk(c,fn));}
function clone(n){const x=JSON.parse(JSON.stringify(n));walk(x,c=>c.id='n'+(++serial));return x;}
function find(n,id){if(n.id===id)return n;for(const c of n.children){const x=find(c,id);if(x)return x;}return null;}
function parent(n,id){for(const c of n.children){if(c.id===id)return n;const p=parent(c,id);if(p)return p;}return null;}
function infer(value,name='root'){
 const t=value===null?'null':Array.isArray(value)?'array':typeof value;
 const n=node(name,t,{value: t==='object'||t==='array'||t==='null'?'':String(value)});
 if(t==='object')n.children=Object.keys(value).map(k=>infer(value[k],k));
 if(t==='array')n.children=value.map(v=>infer(v,'item'));
 return n;
}
function decimalParts(text){const m=String(text).trim().match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);if(!m)throw Error('Некорректное число: '+text);const exp=+(m[4]||0);if(Math.abs(exp)>300)throw Error('Слишком большой порядок числа');let all=m[2]+(m[3]||''),point=m[2].length+exp;if(point<0){all='0'.repeat(-point)+all;point=0;}if(point>all.length)all+='0'.repeat(point-all.length);const whole=(all.slice(0,point)||'0').replace(/^0+(?=\d)/,'');const frac=all.slice(point).replace(/0+$/,'');return {whole,frac};}
function parseJSON(text){const value=JSON.parse(text);for(const match of text.matchAll(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)){const token=match[0];if(token[0]==='"')continue;const a=decimalParts(token),num=Number(token);if(!Number.isFinite(num))throw Error('Число вне диапазона браузера: '+token);const b=decimalParts(String(num));if(a.whole!==b.whole||a.frac!==b.frac)throw Error('Число нельзя прочитать без потери точности: '+token+'. Передавайте его как строку.');}return value;}
function primitive(n){
 const v=String(n.value);
 if(n.type==='null')return null;
 if(n.type==='boolean'){if(!['true','false'].includes(v))throw Error(n.name+': значение должно быть true или false');return v==='true';}
 if(['number','integer'].includes(n.type)){
  const p=decimalParts(v),num=Number(v);if(!Number.isFinite(num))throw Error(n.name+': число вне диапазона');
  if(n.type==='integer'&&p.frac)throw Error(n.name+': требуется целое число');
  if(n.scale!==''&&p.frac.length>+n.scale)throw Error(n.name+': слишком много знаков после запятой');
  if(n.digits!==''&&p.whole.replace(/^0$/,'').length>(+n.digits-(+n.scale||0)))throw Error(n.name+': превышена разрядность');
  const round=decimalParts(String(num));if(round.whole!==p.whole||round.frac!==p.frac)throw Error(n.name+': браузер не может сохранить это число точно; используйте строку');
  return num;
 }
 if(n.len!==''&&[...v].length>+n.len)throw Error(n.name+': превышена длина '+n.len);
 if(['date','dateTime'].includes(n.type)){
  const day=v.slice(0,10),parsed=new Date(day+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day)throw Error(n.name+': некорректная календарная дата');
  if(n.type==='date'&&v.length!==10)throw Error(n.name+': дата в формате YYYY-MM-DD');
  if(n.type==='dateTime'&&(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)||!Number.isFinite(Date.parse(v))))throw Error(n.name+': дата-время ISO 8601 с часовым поясом, например 2026-01-01T12:00:00Z');
 }
 return v;
}
function check(n,xml=false){
 if(!types.includes(n.type))throw Error('Неизвестный тип '+n.type);
 if(xml&&!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(n.name))throw Error('Недопустимое XML-имя: '+n.name+' (пространство имён задаётся отдельно)');
 for(const k of ['len','digits','scale'])if(n[k]!==''&&(!Number.isInteger(+n[k])||+n[k]<0))throw Error(n.name+': '+k+' должно быть целым неотрицательным');
 if(n.digits!==''&&(+n.digits<1||+n.digits>15))throw Error(n.name+': поддерживается от 1 до 15 цифр; для больших чисел используйте строку');
 if(n.scale!==''&&n.digits!==''&&+n.scale>+n.digits)throw Error(n.name+': дробная часть больше общей разрядности');
 if(n.xmlAttribute&&['array','object','null'].includes(n.type))throw Error(n.name+': XML-атрибут должен быть простым значением');
 if(n.type==='object'){const names=new Set();for(const c of n.children){const key=(xml&&c.xmlAttribute?'@':'')+c.name;if(names.has(key))throw Error('Повторное имя поля: '+key);names.add(key);}}
 if(!['object','array'].includes(n.type)&&n.children.length)throw Error(n.name+': у простого типа не должно быть вложенных полей');
 n.children.forEach(c=>check(c,xml));
}
function valueOf(n){if(n.type==='object'){const o=Object.create(null);n.children.forEach(c=>o[c.name]=valueOf(c));return o;}if(n.type==='array')return n.children.map(valueOf);return primitive(n);}
function json(n){check(n);return JSON.stringify(valueOf(n),null,2);}
function schemaOf(n){
 const s={type:['date','dateTime'].includes(n.type)?'string':n.type};if(n.description)s.description=n.description;
 if(n.source)s['x-source-name']=n.source;
 if(n.type==='object'){s.properties=Object.create(null);n.children.forEach(c=>s.properties[c.name]=schemaOf(c));const req=n.children.filter(c=>c.required).map(c=>c.name);if(req.length)s.required=req;}
 if(n.type==='array'){
  const variants=n.children.map(schemaOf);const unique=[...new Map(variants.map(v=>[JSON.stringify(v),v])).values()];
  s.items=unique.length>1?{anyOf:unique}:unique[0]||{};
 }
 if(n.len!==''&&s.type==='string')s.maxLength=+n.len;
 if(n.type==='date')s.format='date';if(n.type==='dateTime')s.format='date-time';
 if(['number','integer'].includes(n.type)){
  if(n.scale!==''){s.multipleOf=Number('1e-'+n.scale);s['x-fraction-digits']=+n.scale;}
  if(n.digits!==''){const bound=10**(+n.digits-(+n.scale||0));s.exclusiveMinimum=-bound;s.exclusiveMaximum=bound;s['x-total-digits']=+n.digits;}
 }
 return s;
}
function schema(n){check(n);return JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',title:n.name,...schemaOf(n)},null,2);}
function fromSchema(s,name='root',root=s,seen=[]){
 if(typeof s!=='object'||s===null||Array.isArray(s))throw Error('Ожидалась объектная JSON Schema');
 if(s.format&&!['date','date-time'].includes(s.format))throw Error('Не поддержан формат схемы: '+s.format);
 if(s.$ref){if(!s.$ref.startsWith('#/'))throw Error('Внешние $ref не поддерживаются');if(seen.includes(s.$ref))throw Error('Рекурсивная схема не разворачивается в конечную таблицу');let r=root;for(const p of s.$ref.slice(2).split('/'))r=r?.[p.replace(/~1/g,'/').replace(/~0/g,'~')];if(!r)throw Error('Не найден '+s.$ref);return fromSchema(r,name,root,[...seen,s.$ref]);}
 for(const k of ['allOf','oneOf','not','if','patternProperties','dependentSchemas','prefixItems'])if(k in s)throw Error('Импорт схемы: конструкция '+k+' пока не поддерживается');
 if(s.anyOf)throw Error('Импорт неоднородного anyOf: загрузите исходное сообщение или проект');
 if(Array.isArray(s.type))throw Error('Составной тип схемы: загрузите проект или выберите один тип');
 const t=s.format==='date'?'date':s.format==='date-time'?'dateTime':s.type||(s.properties?'object':'string');
 const n=node(name,t,{len:s.maxLength??'',digits:s['x-total-digits']??'',scale:s['x-fraction-digits']??'',description:s.description||'',source:s['x-source-name']||s['x-1c-source']||'',value:s.default!==undefined?String(s.default):t==='boolean'?'false':['number','integer'].includes(t)?'0':t==='date'?'2026-01-01':t==='dateTime'?'2026-01-01T00:00:00Z':''});
 if(n.scale===''&&s.multipleOf){const log=-Math.log10(s.multipleOf);if(Number.isInteger(log)&&log>=0)n.scale=log;else throw Error('Импорт multipleOf поддерживает степени 0.1');}
 const supported=new Set(['$schema','$id','$defs','definitions','$ref','title','type','description','default','properties','required','items','maxLength','format','multipleOf','exclusiveMinimum','exclusiveMaximum','x-total-digits','x-fraction-digits','x-source-name','x-1c-source']);
 for(const k of Object.keys(s))if(!supported.has(k))throw Error('Импорт схемы не поддерживает ограничение '+k+'; оно не будет потеряно молча');
 if(('exclusiveMinimum' in s||'exclusiveMaximum' in s)&&n.digits==='')throw Error('Произвольные числовые границы пока не импортируются');
 if(n.digits!==''){const bound=10**(+n.digits-(+n.scale||0));if(('exclusiveMinimum' in s&&s.exclusiveMinimum!==-bound)||('exclusiveMaximum' in s&&s.exclusiveMaximum!==bound))throw Error('Границы схемы не соответствуют разрядности');}
 if(s.multipleOf&&n.scale!==''&&s.multipleOf!==10**(-(+n.scale)))throw Error('Шаг числа не соответствует дробной разрядности');
 if(t==='object')n.children=Object.entries(s.properties||{}).map(([k,v])=>({...fromSchema(v,k,root,seen),required:(s.required||[]).includes(k)}));
 if(t==='array'&&s.items&&Object.keys(s.items).length)n.children=[fromSchema(s.items,'item',root,seen)];return n;
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function xml(n,ns=''){
 check(n,true);
 function emit(x,depth,root=false){const pad='  '.repeat(depth),attrs=x.children.filter(c=>c.xmlAttribute).map(c=>' '+c.name+'="'+esc(primitive(c))+'"').join('');const namespace=root?(ns?' xmlns="'+esc(ns)+'"':'')+' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"':'';
 if(x.type==='null')return pad+'<'+x.name+namespace+' xsi:nil="true"/>';
 if(['object','array'].includes(x.type)){const children=x.children.filter(c=>!c.xmlAttribute).map(c=>emit(c,depth+1));return pad+'<'+x.name+namespace+attrs+'>'+ (children.length?'\n'+children.join('\n')+'\n'+pad:'')+'</'+x.name+'>';}
 return pad+'<'+x.name+namespace+'>'+esc(primitive(x))+'</'+x.name+'>';
 }return '<?xml version="1.0" encoding="UTF-8"?>\n'+emit(n,0,true);
}
function parseXML(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('DTD и внешние сущности не поддерживаются');const doc=new DOMParser().parseFromString(text,'application/xml');const error=doc.querySelector('parsererror');if(error)throw Error('Ошибка XML: '+error.textContent.slice(0,220));return doc;}
function fromXML(text){const doc=parseXML(text);const uri=doc.documentElement.namespaceURI||'';
 function read(el){if(el.namespaceURI&&el.namespaceURI!==uri)throw Error('Несколько пространств имён в одном сообщении пока не поддерживаются');const kids=[...el.children],attrs=[...el.attributes].filter(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&a.namespaceURI!=='http://www.w3.org/2001/XMLSchema-instance');if(attrs.some(a=>a.namespaceURI))throw Error('Атрибуты с префиксами пока не поддерживаются');if(kids.length&&[...el.childNodes].some(x=>x.nodeType===3&&x.textContent.trim()))throw Error('Смешанное содержимое XML пока не поддерживается');if(!kids.length&&attrs.length&&el.textContent.trim())throw Error('Текстовый элемент с атрибутами пока не поддерживается');
 const nil=el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance','nil')==='true';
 const duplicate=new Set(kids.map(k=>k.localName)).size<kids.length;
 if(duplicate&&new Set(kids.map(k=>k.localName)).size>1)throw Error('Повторяющиеся XML-элементы разных имён: используйте отдельные контейнеры массивов');
 const n=node(el.localName,nil?'null':kids.length?(duplicate?'array':'object'):attrs.length?'object':'string',{value:kids.length||attrs.length?'':el.textContent});
 n.children=[...attrs.map(a=>node(a.localName,'string',{xmlAttribute:true,value:a.value})),...kids.map(read)];return n;
 }return {root:read(doc.documentElement),namespace:uri};
}
function xsd(n,ns=''){
 check(n,true);const p='xs:';
 function simple(x,d){const pad='  '.repeat(d),base={string:'string',number:'decimal',integer:'integer',boolean:'boolean',date:'date',dateTime:'dateTime',null:'string'}[x.type];let facets='';if(x.len!==''&&x.type==='string')facets+='\n'+pad+'  <xs:maxLength value="'+x.len+'"/>';if(x.digits!==''&&['number','integer'].includes(x.type))facets+='\n'+pad+'  <xs:totalDigits value="'+x.digits+'"/>';if(x.scale!==''&&x.type==='number')facets+='\n'+pad+'  <xs:fractionDigits value="'+x.scale+'"/>';if(x.digits!==''&&['number','integer'].includes(x.type)){let bound='1'+'0'.repeat(+x.digits-(+x.scale||0));facets+='\n'+pad+'  <xs:minExclusive value="-'+bound+'"/>\n'+pad+'  <xs:maxExclusive value="'+bound+'"/>';}
 return pad+'<xs:simpleType>\n'+pad+' <xs:restriction base="xs:'+base+'">'+facets+'\n'+pad+' </xs:restriction>\n'+pad+'</xs:simpleType>';
 }
 function emit(x,d,root=false,repeat=false){const pad='  '.repeat(d),tag=x.xmlAttribute?'attribute':'element',occur=x.xmlAttribute?' use="'+(x.required?'required':'optional')+'"':root?'':' minOccurs="'+(x.required?'1':'0')+'"'+(repeat?' maxOccurs="unbounded"':'');let s=pad+'<xs:'+tag+' name="'+esc(x.name)+'"'+occur+(x.type==='null'?' nillable="true"':'')+'>\n';if(x.description)s+=pad+'  <xs:annotation><xs:documentation>'+esc(x.description)+'</xs:documentation></xs:annotation>\n';
 if(['object','array'].includes(x.type)){s+=pad+'  <xs:complexType>\n';let ch=x.children.filter(c=>!c.xmlAttribute);if(x.type==='array'&&ch.length){const variants=ch.map(c=>JSON.stringify(schemaOf(c)));if(new Set(variants).size>1||new Set(ch.map(c=>c.name)).size>1)throw Error(x.name+': XSD требует одинаковую структуру и имя элементов массива');ch=ch.slice(0,1);}if(ch.length)s+=pad+'    <xs:sequence>\n'+ch.map(c=>emit(c,d+3,false,x.type==='array')).join('\n')+'\n'+pad+'    </xs:sequence>\n';s+=x.children.filter(c=>c.xmlAttribute).map(c=>emit(c,d+2)).join('\n');s+='\n'+pad+'  </xs:complexType>\n';}else s+=simple(x,d+1)+'\n';return s+pad+'</xs:'+tag+'>';}
 return '<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"'+(ns?' targetNamespace="'+esc(ns)+'" xmlns="'+esc(ns)+'" elementFormDefault="qualified"':'')+'>\n'+emit(n,1,true)+'\n</xs:schema>';
}
function fromXSD(text){const doc=parseXML(text),schema=doc.documentElement,uri='http://www.w3.org/2001/XMLSchema';if(schema.localName!=='schema'||schema.namespaceURI!==uri)throw Error('Ожидалась XSD-схема');const disallowed=['include','import','choice','all','extension','simpleContent','complexContent','group','attributeGroup','any','anyAttribute','key','keyref','unique','list','union'];for(const tag of disallowed)if(doc.getElementsByTagNameNS(uri,tag).length)throw Error('XSD: '+tag+' пока не поддерживается');
 const direct=(el,name)=>[...el.children].filter(x=>x.namespaceURI===uri&&x.localName===name);
 const roots=direct(schema,'element');if(roots.length!==1)throw Error('XSD должна иметь один корневой элемент');
 function read(el,seen=[]){if(el.hasAttribute('ref'))throw Error('XSD ref пока не поддерживается');let ct=direct(el,'complexType')[0],st=direct(el,'simpleType')[0];const tn=el.getAttribute('type');if(tn&&!tn.startsWith('xs:')&&!tn.startsWith('xsd:')){if(seen.includes(tn))throw Error('Рекурсивная XSD');const def=[...schema.children].find(c=>c.getAttribute('name')===tn.split(':').pop());if(!def)throw Error('Не найден XSD-тип '+tn);if(def.localName==='complexType')ct=def;else st=def;seen=[...seen,tn];}
 const restriction=st?direct(st,'restriction')[0]:null;const base=(restriction?.getAttribute('base')||tn||'xs:string').split(':').pop();const mapped={string:'string',decimal:'number',integer:'integer',int:'integer',long:'integer',boolean:'boolean',date:'date',dateTime:'dateTime'};if(!ct&&!mapped[base])throw Error('Не поддержан XSD-тип '+base);
 const n=node(el.getAttribute('name'),ct?'object':mapped[base],{required:el.localName==='attribute'?el.getAttribute('use')==='required':el.getAttribute('minOccurs')!=='0',xmlAttribute:el.localName==='attribute',value:['decimal','integer','int','long'].includes(base)?'0':base==='boolean'?'false':base==='date'?'2026-01-01':base==='dateTime'?'2026-01-01T00:00:00':''});
 if(el.getAttribute('nillable')==='true'&&!ct)n.type='null';
 const docu=el.getElementsByTagNameNS(uri,'documentation')[0];if(docu)n.description=docu.textContent;
 if(restriction)for(const f of restriction.children){const map={maxLength:'len',totalDigits:'digits',fractionDigits:'scale'};if(map[f.localName])n[map[f.localName]]=+f.getAttribute('value');else if(!['annotation','minExclusive','maxExclusive'].includes(f.localName))throw Error('XSD-ограничение '+f.localName+' пока не поддерживается');}
 if(restriction){for(const k of ['minExclusive','maxExclusive']){const f=direct(restriction,k)[0];if(f&&(n.digits===''||Number(f.getAttribute('value'))!==(k==='minExclusive'?-1:1)*10**(+n.digits-(+n.scale||0))))throw Error('Произвольная XSD-граница '+k+' пока не поддерживается');}}
 if(ct){const seq=direct(ct,'sequence')[0];n.children=[...(seq?direct(seq,'element').map(e=>read(e,seen)):[]),...direct(ct,'attribute').map(e=>read(e,seen))];if(seq){const els=direct(seq,'element');if(els.length===1&&els[0].getAttribute('maxOccurs')==='unbounded')n.type='array';else if(els.some(e=>e.hasAttribute('maxOccurs')&&e.getAttribute('maxOccurs')!=='1'))throw Error('Повторяющиеся поля XSD должны быть в отдельном контейнере массива');}}
 return n;
 }return {root:read(roots[0]),namespace:schema.getAttribute('targetNamespace')||''};
}
function restore(project){if(project.version!==1||!project.root)throw Error('Неизвестный формат проекта');let count=0;function read(x,depth){if(depth>64||++count>5000)throw Error('Проект слишком большой');if(!x||typeof x.name!=='string'||!types.includes(x.type)||!Array.isArray(x.children))throw Error('Повреждённое поле проекта');const n=node(x.name,x.type);for(const key of ['len','digits','scale','required','value','description','source','xmlAttribute'])if(x[key]!==undefined)n[key]=x[key];n.children=x.children.map(c=>read(c,depth+1));return n;}return {...project,root:read(project.root,0)};}
const API={node,walk,clone,find,parent,infer,json,schema,xml,xsd,fromSchema,fromXML,fromXSD,restore,check,types,parseJSON};global.MessageCore=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window==='undefined'?globalThis:window);
