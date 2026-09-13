import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const NORTHSTAR_ATTESTATION_SCHEMA = "northstar.attestation.v1";
const required=(value,label)=>{if(!value||!String(value).trim())throw new Error(`${label} is required`);return String(value).trim()};
const artifactHash=envelope=>createHash("sha256").update(JSON.stringify(envelope)).digest("hex");

export function buildNorthstarAttestation({release,organizationId,projectId,objectiveId=null,requirementId=null,subjectId,engineVersion="0.1.0",policyVersion="buildos.v1",attestationId=randomUUID(),observedAt=new Date().toISOString()}){
  if(!release||release.status!=="green"||release.productionVerification!=="verified")throw new Error("BuildOS can emit PASS only from a GREEN release with verified production evidence");
  const sourceSha=required(release.commitSha,"release commitSha"),deploymentId=required(release.deployment?.id,"release deployment.id"),url=required(release.deployment?.url,"release deployment.url");
  if(release.deployment?.sourceSha&&release.deployment.sourceSha!==sourceSha)throw new Error("Deployment sourceSha does not match the certified release commitSha");
  const unsigned={schemaVersion:NORTHSTAR_ATTESTATION_SCHEMA,attestationId,organizationId:required(organizationId,"organizationId"),projectId:required(projectId,"projectId"),objectiveId,requirementId,engine:"buildos",engineVersion,status:"PASS",subject:{type:"release",id:required(subjectId||`${release.repository}@${sourceSha}`,"subject.id")},identity:{sourceSha,deploymentId,contentHash:null,url},observedAt,policyVersion,evidence:[{type:"buildos.release",repository:release.repository,branch:release.branch,verifiedAt:release.verifiedAt},{type:"deployment",provider:release.deployment.provider||"unknown",state:release.deployment.state,verifiedAt:release.deployment.verifiedAt||null},...(Array.isArray(release.evidence)?release.evidence:[])],findings:Array.isArray(release.findings)?release.findings:[]};
  return {...unsigned,artifactHash:artifactHash(unsigned)};
}
export function readRelease(path){return JSON.parse(readFileSync(path,"utf8"))}
export async function submitNorthstarAttestation({endpoint,token,attestation,fetchImpl=fetch}){required(endpoint,"Northstar endpoint");required(token,"Northstar ingestion token");const response=await fetchImpl(endpoint,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({action:"ingest_attestation",attestation})});const body=await response.json().catch(()=>({}));if(!response.ok||body.ok!==true)throw new Error(`Northstar rejected attestation (${response.status}): ${body.message||body.code||"unknown error"}`);return body}
