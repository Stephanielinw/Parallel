  const STORAGE_COMPRESSED_PREFIX='PARALLEL-LZW14-V1:';
  function compressStoredJson(value){
    const bytes=new TextEncoder().encode(value),dictionary=new Map();
    let prev=bytes[0],next=257,parts=[],part=[];
    const emit=code=>{
      part.push(String.fromCharCode(code+32));
      if(part.length>=8192){parts.push(part.join(''));part=[];}
    };
    for(let i=1;i<bytes.length;i++){
      const byte=bytes[i],key=prev*256+byte,found=dictionary.get(key);
      if(found!==undefined){prev=found;continue;}
      emit(prev);
      if(next>=16384){emit(256);dictionary.clear();next=257;}
      else dictionary.set(key,next++);
      prev=byte;
    }
    if(bytes.length)emit(prev);
    if(part.length)parts.push(part.join(''));
    return STORAGE_COMPRESSED_PREFIX+parts.join('');
  }
  function decompressStoredJson(value){
    if(!value||!value.startsWith(STORAGE_COMPRESSED_PREFIX))return value;
    if(typeof TextDecoder!=='function')throw Error('当前浏览器缺少读取压缩存档所需的 TextDecoder');
    const dictionary=new Array(16384);
    let next=257,previous='',buffer=new Uint8Array(Math.max(8192,Math.min(32*1024*1024,value.length*3))),used=0;
    const append=entry=>{
      if(used+entry.length>100*1024*1024)throw Error('压缩存档的解压长度异常');
      if(used+entry.length>buffer.length){
        let size=buffer.length;
        while(size<used+entry.length)size*=2;
        const grown=new Uint8Array(size);grown.set(buffer);buffer=grown;
      }
      for(let i=0;i<entry.length;i++)buffer[used++]=entry.charCodeAt(i);
    };
    for(let i=STORAGE_COMPRESSED_PREFIX.length;i<value.length;i++){
      const code=value.charCodeAt(i)-32;
      if(code===256){dictionary.fill(undefined);next=257;previous='';continue;}
      if(code<0||code>=16384)throw Error('压缩存档包含无效编码');
      const entry=code<256?String.fromCharCode(code):
        (dictionary[code]||(code===next&&previous?previous+previous[0]:null));
      if(!entry)throw Error('压缩存档的编码链不完整');
      append(entry);
      if(previous&&next<16384)dictionary[next++]=previous+entry[0];
      previous=entry;
    }
    return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));
  }
  function encodeStoredJson(value){
    if(typeof TextEncoder!=='function'||typeof TextDecoder!=='function'||value.length<20000)return value;
    const compact=compressStoredJson(value);
    if(compact.length>=value.length*.9)return value;
    // Verify before replacing the sole authoritative browser copy.
    if(decompressStoredJson(compact)!==value)throw Error('压缩存档校验未通过；已保留原始存档');
    return compact;
  }

