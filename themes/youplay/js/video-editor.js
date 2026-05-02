(function(){
  function qs(id){ return document.getElementById(id); }
  function parseSegments(s){
    if(!s) return [];
    return s.split(',').map(function(seg){
      var parts = seg.split('-'); if(parts.length!=2) return null;
      return {start: parts[0].trim(), end: parts[1].trim()};
    }).filter(Boolean);
  }
  function payload(){
    return {
      video_id: PT_DATA.ID || (window.location.search.match(/id=(\d+)/)||[])[1],
      edl: {
        cuts: parseSegments(qs('trim_input').value),
        stabilization: qs('stab_backend').value,
        quality: qs('quality_preset').value
      }
    };
  }
  function ajax(url, data, cb){
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
    xhr.onreadystatechange = function(){
      if(xhr.readyState==4){ cb(JSON.parse(xhr.responseText||'{}')); }
    };
    var params=[]; for (var k in data){ params.push(encodeURIComponent(k)+'='+encodeURIComponent(typeof data[k]=='string'?data[k]:JSON.stringify(data[k]))); }
    params.push('hash=' + (window.__hash || ''));
    xhr.send(params.join('&'));
  }

  qs('save_edl_btn').onclick = function(){
    ajax('{{CONFIG site_url}}/aj/video_editor?first=save', payload(), function(res){
      var el = document.getElementById('render_status');
      if(res.status==200) el.textContent='{{LANG draft_saved}}';
      else el.textContent = res.message || 'Error';
    });
  };
  qs('render_btn').onclick = function(){
    ajax('{{CONFIG site_url}}/aj/video_editor?first=render', payload(), function(res){
      var el = document.getElementById('render_status');
      if(res.status==200){
        el.textContent='{{LANG rendering_started}}';
        var job=res.job_id;
        var iv = setInterval(function(){
          ajax('{{CONFIG site_url}}/aj/video_editor?first=status', {job_id:job}, function(r){
            if(r.status==200){
              el.textContent = 'Progress: '+r.progress+'%';
              if(r.progress>=100){ clearInterval(iv); el.textContent='{{LANG rendering_done}}'; location.reload(); }
            } else { clearInterval(iv); el.textContent = r.message||'Error'; }
          });
        }, 3000);
      } else {
        el.textContent = res.message||'Error';
      }
    });
  };

})();
