(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;}else{root.HigaPortal=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VALID_ROLES=['student','reviewer','admin'];

  function parseAccess(urlLike){
    const url=urlLike instanceof URL?urlLike:new URL(String(urlLike),'https://example.invalid/');
    const hash=new URLSearchParams(String(url.hash||'').replace(/^#/,''));
    const query=new URLSearchParams(String(url.search||'').replace(/^\?/,''));
    const role=String(hash.get('role')||query.get('role')||'').toLowerCase();
    const token=String(hash.get('token')||query.get('token')||'');
    return {role,token,valid:VALID_ROLES.includes(role)&&token.length>=12};
  }

  function buildAppUrl(deploymentUrl,access){
    if(!access||!access.valid) return '';
    return deploymentUrl+'?role='+encodeURIComponent(access.role)+'&token='+encodeURIComponent(access.token);
  }

  function canonicalHash(access){
    if(!access||!access.valid) return '';
    return '#role='+encodeURIComponent(access.role)+'&token='+encodeURIComponent(access.token);
  }

  return {VALID_ROLES,parseAccess,buildAppUrl,canonicalHash};
});
