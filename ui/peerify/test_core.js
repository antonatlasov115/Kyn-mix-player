const koffi = require('koffi');
const path = require('path');
const fs = require('fs');

const DLL_PATH = path.join(__dirname, 'core', 'peerify_core.dll');

console.log('Checking DLL at:', DLL_PATH);
if (!fs.existsSync(DLL_PATH)) {
    console.error('DLL NOT FOUND!');
    process.exit(1);
}

if (process.platform === 'win32') {
    process.env.PATH = `${path.join(__dirname, 'core')};${process.env.PATH}`;
}

try {
    console.log('Loading DLL...');
    const lib = koffi.load(DLL_PATH);
    console.log('DLL Loaded successfully.');

    const PlayerEvent = koffi.struct('PlayerEvent', { type: 'int', state: 'int' });
    const Player_PollEvent = lib.func('Player_PollEvent', 'bool', [koffi.out(koffi.pointer(PlayerEvent))]);
    const Player_Init = lib.func('Player_Init', 'bool', []);
    const Player_Shutdown = lib.func('Player_Shutdown', 'void', []);

    console.log('Calling Player_Init...');
    Player_Init();

    const eventBuffer = Buffer.alloc(koffi.sizeof(PlayerEvent));
    console.log('Calling Player_PollEvent...');
    const hasEvent = Player_PollEvent(eventBuffer);
    console.log('Player_PollEvent result:', hasEvent);
    
    if (hasEvent) {
        const event = koffi.decode(eventBuffer, PlayerEvent);
        console.log('Event type:', event.type, 'state:', event.state);
    }

    console.log('Calling Player_Shutdown...');
    Player_Shutdown();
    console.log('Done.');
} catch (err) {
    console.error('FAILED TO CALL DLL FUNCTIONS:', err);
    process.exit(1);
}
