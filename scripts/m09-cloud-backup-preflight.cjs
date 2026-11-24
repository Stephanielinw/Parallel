#!/usr/bin/env node
'use strict';
/**
 * M09 cloud-backup PREPARATION only.
 * Read-only compatibility check; never performs upload, encryption, restore,
 * localStorage changes, IndexedDB mutations or external network requests.
 * A "ready" result is NOT permission to upload plaintext to a cloud service.
 */
const {createHash}=require('node:crypto');
const MAX_BYTES=100*1024*1024;
const SENSITIVE_KEYS=['api_key','image_api_key','archive_api_key'];
const REQUIRED=['profiles','messages','meetings','events','episodicMemories','presets'];
function inspectBackupCandidate(raw){
  if(typeof raw!=='string'||!raw.trim())throw Error('Backup is empty');
  const bytes=Buffer.byteLength(raw,'utf8');
  if(bytes>MAX_BYTES)throw Error('Backup exceeds the 100 MiB compatibility limit');
  let pack;
  try{pack=JSON.parse(raw)}catch{throw Error('Backup is not valid JSON')}
  if(!pack||pack.format!=='parallel-portable-backup'||pack.schemaVersion!==1||
     !pack.data||typeof pack.data!=='object'||Array.isArray(pack.data))
    throw Error('Unsupported Parallel backup schema');
  const data=pack.data;
  for(const key of REQUIRED)if(!Array.isArray(data[key]))throw Error('Missing backup collection: '+key);
  if(!data.connection||typeof data.connection!=='object'||Array.isArray(data.connection))
    throw Error('Missing backup connection metadata');
  for(const key of SENSITIVE_KEYS)if(data.connection[key])throw Error('Backup contains credentials');
  if(Object.prototype.hasOwnProperty.call(data,'systemLogs')||
     Object.prototype.hasOwnProperty.call(pack,'systemLogs'))throw Error('Backup contains generation logs');
  const ids=new Set();
  const imageRefs=new Set();
  for(const msg of data.messages){
    if(!msg||typeof msg.id!=='string'||!msg.id||ids.has(msg.id))
      throw Error('Duplicate or invalid message ID');
    ids.add(msg.id);
    if(msg.photo_kind==='gallery'&&msg.photo_ref)imageRefs.add(msg.photo_ref);
  }
  let hasFiles=Object.prototype.hasOwnProperty.call(pack,'chatPhotoFiles');
  if(hasFiles&&!Array.isArray(pack.chatPhotoFiles))throw Error('Invalid photo bundle');
  const assets=new Set();
  for(const file of hasFiles?pack.chatPhotoFiles:[]){
    if(!file||typeof file.ref!=='string'||!file.ref||assets.has(file.ref)||
       typeof file.data!=='string'||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(file.data))
      throw Error('Invalid or duplicate backup photo');
    assets.add(file.ref);
  }
  for(const ref of imageRefs)if(!assets.has(ref))throw Error('Gallery photo is missing from full backup');
  // Metadata is local-only and never includes user text, IDs, message snippets,
  // profile names, image bytes or provider credentials.
  return Object.freeze({
    format:'parallel-cloud-preflight',
    schemaVersion:1,
    sha256:createHash('sha256').update(Buffer.from(raw,'utf8')).digest('hex'),
    bytes,
    collectionsPresent:REQUIRED.length,
    photoReferences:imageRefs.size,
    photoAttachments:assets.size,
    completePhotoBundle:hasFiles,
    encrypted:false,
    mayUpload:false
  });
}
module.exports={MAX_BYTES,REQUIRED,SENSITIVE_KEYS,inspectBackupCandidate};
