export class Spring {
    target: number = 0;
    value: number = 0;
    vel: number = 0;
    stiffness: number = 0.12;
    damping: number = 0.82;

    constructor(stiffness = 0.12, damping = 0.82) {
        this.stiffness = stiffness;
        this.damping = damping;
    }

    update() {
        const force = (this.target - this.value) * this.stiffness;
        this.vel = (this.vel + force) * this.damping;
        this.value += this.vel;
    }

    isSettled(threshold = 0.01): boolean {
        return Math.abs(this.vel) < threshold && Math.abs(this.target - this.value) < threshold;
    }

    reset() {
        this.value = 0;
        this.vel = 0;
    }
}

export class MascotPhysicsExtended {
    pos = { x: 0, y: 0 };
    vel = { x: 0, y: 0 };
    target = { x: 0, y: 0 };

    jump = new Spring(0.12, 0.82);
    tilt = new Spring(0.096, 0.82); // K_SPRING * 0.8
    squash = new Spring(0.12, 0.82);

    update() {
        // Basic position spring (for following/dragging)
        const dx = this.target.x - this.pos.x;
        const dy = this.target.y - this.pos.y;
        this.vel.x = (this.vel.x + dx * 0.1) * 0.85;
        this.vel.y = (this.vel.y + dy * 0.1) * 0.85;
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        // Advanced springs
        this.jump.update();
        this.tilt.update();
        this.squash.update();
    }
}
