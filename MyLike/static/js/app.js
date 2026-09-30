document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    const page = path.split('/')[1] || 'library';
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });
});

