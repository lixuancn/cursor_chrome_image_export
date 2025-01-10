document.addEventListener('DOMContentLoaded', function() {
  // 加载已保存的设置
  chrome.storage.sync.get({
    savePath: ''  // 默认值为空
  }, function(items) {
    document.getElementById('savePath').value = items.savePath;
  });
});

document.getElementById('save').addEventListener('click', function() {
  const savePath = document.getElementById('savePath').value.trim();
  
  chrome.storage.sync.set({
    savePath: savePath
  }, function() {
    const status = document.getElementById('status');
    status.textContent = '设置已保存';
    setTimeout(function() {
      status.textContent = '';
    }, 2000);
  });
}); 