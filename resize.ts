export default (canvas: HTMLCanvasElement) => {
    const _$$c: HTMLCanvasElement = canvas;
    const _$$cw = _$$c.width;
    const _$$ch = _$$c.height;
    function _$$adaptSize() {
        let rhl = _$$cw / _$$ch;
        let rlh = _$$ch / _$$cw;
        if (window.innerWidth > window.innerHeight * rhl) {
            _$$c.style.width = 'inherit';
            _$$c.style.height = '100%';
        }
        if (window.innerHeight > window.innerWidth * rlh) {
            _$$c.style.height = 'inherit';
            _$$c.style.width = '100%';
        }
    }
    _$$adaptSize();

    window.addEventListener('resize', _$$adaptSize);


}