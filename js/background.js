/**
 * WebGL-lite Background Animation (Dynamic Perspective Grid)
 */
class PerspectiveGrid {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.options = Object.assign({
            gridSize: 60,
            lineColor: 'rgba(37, 99, 235, 0.08)',
            lineWidth: 1,
            speed: 0.2,
            perspectiveShift: 200,
            opacity: 0.6
        }, options);

        this.offset = 0;
        this.w = 0;
        this.h = 0;

        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.animate();
    }

    resize() {
        this.w = this.canvas.width = window.innerWidth;
        this.h = this.canvas.height = this.canvas.parentElement.offsetHeight || window.innerHeight;
    }

    draw() {
        const { ctx, w, h, options } = this;
        const { gridSize, lineColor, lineWidth, perspectiveShift } = options;

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        
        // Vertical perspective lines
        for (let x = -gridSize; x < w + gridSize; x += gridSize) {
            ctx.moveTo(x + (this.offset % gridSize), 0);
            ctx.lineTo(x + (this.offset % gridSize) - perspectiveShift, h);
        }

        // Horizontal static lines
        for (let y = 0; y < h; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }

        ctx.stroke();
    }

    animate() {
        this.offset += this.options.speed;
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    const isDark = document.body.classList.contains('dark-theme') || (window.getComputedStyle(document.body).backgroundColor === 'rgb(11, 17, 33)');
    
    new PerspectiveGrid('hero-canvas', {
        lineColor: isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(37, 99, 235, 0.08)',
        speed: 0.15,
        perspectiveShift: 150
    });
    
    new PerspectiveGrid('bg-canvas', {
        lineColor: 'rgba(96, 165, 250, 0.12)',
        speed: 0.1,
        perspectiveShift: 100
    });
});
