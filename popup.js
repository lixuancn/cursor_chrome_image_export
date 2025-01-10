document.addEventListener('DOMContentLoaded', function() {
  loadImages();
  document.getElementById('exportPdf').addEventListener('click', exportToPdf);
  document.getElementById('clearAll').addEventListener('click', clearAllScreenshots);
});

function clearAllScreenshots() {
  if (confirm('确定要清空所有截图吗？')) {
    chrome.storage.local.set({ screenshots: [] }, function() {
      // 清空后重新加载图片列表
      loadImages();
    });
  }
}

function loadImages() {
  chrome.storage.local.get(['screenshots'], function(result) {
    const screenshots = result.screenshots || [];
    const grid = document.getElementById('imageGrid');
    
    // 按时间排序
    screenshots.sort((a, b) => b.timestamp - a.timestamp);
    
    grid.innerHTML = screenshots.map(screenshot => `
      <div class="image-item">
        <input type="checkbox" class="image-checkbox" data-filename="${screenshot.filename}">
        <img src="${screenshot.dataUrl}" alt="${screenshot.filename}">
      </div>
    `).join('');
  });
}

async function exportToPdf() {
  const selectedImages = Array.from(document.querySelectorAll('.image-checkbox:checked'));
  if (selectedImages.length === 0) {
    alert('请选择要导出的图片');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 10;

  for (const checkbox of selectedImages) {
    const img = checkbox.nextElementSibling;
    const imgData = img.src;
    
    doc.addImage(imgData, 'PNG', 10, y, 190, 0);
    y += 150;
    
    if (y > 280) {
      doc.addPage();
      y = 10;
    }
  }

  doc.save('screenshots.pdf');
} 