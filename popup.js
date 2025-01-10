document.addEventListener('DOMContentLoaded', function() {
  loadImages();
  document.getElementById('exportPdf').addEventListener('click', exportToPdf);
  document.getElementById('clearAll').addEventListener('click', clearAllScreenshots);
});

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

  const doc = new window.jspdf.jsPDF();
  let y = 10;

  for (let i = 0; i < selectedImages.length; i++) {
    const checkbox = selectedImages[i];
    const img = checkbox.nextElementSibling;
    const imgData = img.src;
    
    // 计算图片在PDF中的尺寸
    const imgWidth = 190;
    const imgHeight = (img.naturalHeight * imgWidth) / img.naturalWidth;
    
    doc.addImage(imgData, 'PNG', 10, y, imgWidth, imgHeight);
    y += imgHeight + 10;
    
    if (y > 280 && i < selectedImages.length - 1) {
      doc.addPage();
      y = 10;
    }
  }

  doc.save('screenshots.pdf');
}

// 添加清空功能
function clearAllScreenshots() {
  if (confirm('确定要清空所有截图吗？')) {
    chrome.storage.local.set({ screenshots: [] }, function() {
      loadImages(); // 重新加载图片列表（现在应该是空的）
    });
  }
} 