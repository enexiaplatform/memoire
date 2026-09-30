import {normalizeExternalObservation,type ExternalObservation} from '../../domain/commercialKernel/externalObservation.ts';

/** Transport-independent export profiles. Credentials and vendor SDKs never enter the Kernel. */
export const connectorKinds=['crm','email','calendar','erp','finance'] as const;
export type ConnectorKind=typeof connectorKinds[number];
export const CONNECTOR_EXPORT_MAX_BYTES=128000;
export const CONNECTOR_EXPORT_MAX_RECORDS=50;
type SourceRecord={id:string;version:string;reportedAt:string|null;title:string;text:string};
export type ConnectorPreview={kind:ConnectorKind;namespace:string;observations:ExternalObservation[]};

function exactObject(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Source export fields are not supported.');
 return value as Record<string,unknown>;
}

/** Pure normalization: adapters cannot accept Evidence, make decisions or write business records. */
export function previewConnectorExport(content:string):ConnectorPreview{
 if(new TextEncoder().encode(content).byteLength>CONNECTOR_EXPORT_MAX_BYTES)throw new Error('Source export is too large. Use at most 128 KB and 50 records.');
 const document=exactObject(JSON.parse(content),['format','version','kind','namespace','records']);
 if(document.format!=='memoire.connector-export'||document.version!==1||!connectorKinds.includes(document.kind as ConnectorKind)
  ||typeof document.namespace!=='string'||!document.namespace.trim()||document.namespace.length>180
  ||!Array.isArray(document.records)||!document.records.length||document.records.length>CONNECTOR_EXPORT_MAX_RECORDS)throw new Error('Source export format, source or record count is invalid.');
 const kind=document.kind as ConnectorKind,namespace=document.namespace;
 const observations=document.records.map(value=>{
  const record=exactObject(value,['id','version','reportedAt','title','text']) as unknown as SourceRecord;
  return normalizeExternalObservation({schemaVersion:1,sourceKind:kind==='finance'?'erp':kind,sourceNamespace:kind+':'+namespace,
   sourceEventId:record.id,sourceVersion:record.version,observedAt:record.reportedAt,summary:record.title,rawText:record.text});
 });
 const identities=new Set<string>();
 for(const observation of observations){const key=JSON.stringify([observation.sourceEventId,observation.sourceVersion]);if(identities.has(key))throw new Error('Source export repeats a record version. Keep each version once.');identities.add(key);}
 return {kind,namespace,observations};
}
