(function(){
  const cssCandidates = [
    'ac-rule-viewer.css',
    './ac-rule-viewer.css',
    '../ac-rule-viewer.css',
    '../../ac-rule-viewer.css',
    '../../../ac-rule-viewer.css',
    '../../../../ac-rule-viewer.css',
    '../../../../../ac-rule-viewer.css',
    '/ac-rule-viewer.css'
  ];

  const link = document.getElementById('viewerStylesheet');
  if(!link) return;

  let index = 0;
  link.addEventListener('error', function(){
    index += 1;
    if(index < cssCandidates.length){
      link.setAttribute('href', cssCandidates[index]);
    }
  });
})();
