import {
  MathUtils,
  Vector3,
} from 'three';

const _wishDirection = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _displacement = new Vector3();
const _targetHorizontal = new Vector3();
const _cameraOffset = new Vector3();
const _impulseDirection = new Vector3();

const DEFAULT_CONFIG = Object.freeze({
  radius: 0.36,
  standingHeight: 1.82,
  crouchingHeight: 1.2,
  standingEyeHeight: 1.67,
  crouchingEyeHeight: 1.04,
  walkSpeed: 4.6,
  sprintSpeed: 7.4,
  crouchSpeed: 2.3,
  groundAcceleration: 38,
  airAcceleration: 9,
  groundFriction: 14,
  gravity: 25,
  jumpSpeed: 8.1,
  lookSensitivity: 0.0018,
  maxPitch: MathUtils.degToRad(88),
  evadeSpeed: 10.5,
  evadeDuration: 0.22,
  evadeCooldown: 0.85,
});

export class FirstPersonController {
  constructor({
    camera,
    input,
    collisionWorld,
    spawn = new Vector3(0, 0, 8),
    config = {},
  }) {
    this.name = 'FirstPersonController';
    this.camera = camera;
    this.input = input;
    this.collisionWorld = collisionWorld;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.position = spawn.clone();
    this.previousPosition = spawn.clone();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.crouching = false;
    this.eyeHeight = this.config.standingEyeHeight;
    this.currentHeight = this.config.standingHeight;
    this.bobTime = 0;
    this.bobWeight = 0;
    this.combatPauseRemaining = 0;
    this.viewImpulse = {
      pitch: 0,
      yaw: 0,
      roll: 0,
      kick: 0,
    };
    this.enabled = true;
    this.evadeRemaining = 0;
    this.evadeCooldownRemaining = 0;
    this.evadeDirection = new Vector3();
    this.evadeStartPosition = new Vector3();
    this.#syncCamera(0, 1);
  }

  update(delta, context) {
    if (!this.enabled || !context.state.isPlaying) return;

    const look = this.input.consumeLookDelta();
    const locallyPaused = this.combatPauseRemaining > 0;
    this.combatPauseRemaining = Math.max(0, this.combatPauseRemaining - delta);
    if (!locallyPaused) {
      this.yaw -= look.x * this.config.lookSensitivity;
      this.pitch = MathUtils.clamp(
        this.pitch - look.y * this.config.lookSensitivity,
        -this.config.maxPitch,
        this.config.maxPitch,
      );
    }
    this.viewImpulse.pitch = MathUtils.damp(this.viewImpulse.pitch, 0, 17, delta);
    this.viewImpulse.yaw = MathUtils.damp(this.viewImpulse.yaw, 0, 17, delta);
    this.viewImpulse.roll = MathUtils.damp(this.viewImpulse.roll, 0, 19, delta);
    this.viewImpulse.kick = MathUtils.damp(this.viewImpulse.kick, 0, 20, delta);

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMoving = planarSpeed > 0.3 && this.grounded;
    this.bobTime += isMoving ? delta * Math.min(planarSpeed, 8) * 1.65 : delta * 2;
    this.bobWeight = MathUtils.damp(this.bobWeight, isMoving ? 1 : 0, 11, delta);

    const targetFov = this.input.isDown('sprint') && isMoving && !this.crouching ? 78 : 73;
    const nextFov = MathUtils.damp(this.camera.fov, targetFov, 7, delta);
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.#syncCamera(delta, 1);
  }

  fixedUpdate(fixedDelta, context) {
    if (!this.enabled || !context.state.isPlaying) return;

    this.previousPosition.copy(this.position);
    this.#updateStance(fixedDelta);
    this.evadeRemaining = Math.max(0, this.evadeRemaining - fixedDelta);
    this.evadeCooldownRemaining = Math.max(0, this.evadeCooldownRemaining - fixedDelta);

    const axes = this.input.getMovementAxes();
    if (
      this.grounded
      && this.input.wasPressed('evade')
      && this.evadeCooldownRemaining <= 0
    ) {
      _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const evadeX = axes.x || 0;
      const evadeY = axes.y || -1;
      this.evadeDirection
        .copy(_forward)
        .multiplyScalar(evadeY)
        .addScaledVector(_right, evadeX)
        .normalize();
      this.evadeRemaining = this.config.evadeDuration;
      this.evadeCooldownRemaining = this.config.evadeCooldown;
      this.evadeStartPosition.copy(this.position);
      context.events?.emit?.('player:evade', {
        phase: 'start',
        position: this.position.clone(),
        direction: this.evadeDirection.clone(),
      });
    }
    const wantsMovement = axes.x !== 0 || axes.y !== 0;
    const wantsSprint = this.input.isDown('sprint') && axes.y > 0 && !this.crouching;
    const speed = this.crouching
      ? this.config.crouchSpeed
      : wantsSprint ? this.config.sprintSpeed : this.config.walkSpeed;

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wishDirection
      .set(0, 0, 0)
      .addScaledVector(_forward, axes.y)
      .addScaledVector(_right, axes.x);
    if (_wishDirection.lengthSq() > 1) _wishDirection.normalize();

    _targetHorizontal.copy(
      this.evadeRemaining > 0 ? this.evadeDirection : _wishDirection,
    ).multiplyScalar(
      this.evadeRemaining > 0 ? this.config.evadeSpeed : speed,
    );
    const acceleration = this.grounded
      ? this.config.groundAcceleration
      : this.config.airAcceleration;

    if (wantsMovement || this.evadeRemaining > 0) {
      this.velocity.x = moveToward(
        this.velocity.x,
        _targetHorizontal.x,
        acceleration * fixedDelta,
      );
      this.velocity.z = moveToward(
        this.velocity.z,
        _targetHorizontal.z,
        acceleration * fixedDelta,
      );
    } else if (this.grounded) {
      const friction = this.config.groundFriction * fixedDelta;
      this.velocity.x = moveToward(this.velocity.x, 0, friction);
      this.velocity.z = moveToward(this.velocity.z, 0, friction);
    }

    if (this.grounded && this.input.wasPressed('jump') && !this.crouching) {
      this.velocity.y = this.config.jumpSpeed;
      this.grounded = false;
    } else {
      this.velocity.y -= this.config.gravity * fixedDelta;
    }

    _displacement.copy(this.velocity).multiplyScalar(fixedDelta);
    const result = this.collisionWorld.moveCapsule(
      this.position,
      _displacement,
      this.config.radius,
      this.currentHeight,
    );

    this.position.copy(result.position);
    this.grounded = result.grounded;
    if (result.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (result.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
    if (result.blockedX) this.velocity.x = 0;
    if (result.blockedZ) this.velocity.z = 0;
    if (this.evadeRemaining <= 0 && this.evadeStartPosition.lengthSq() > 0) {
      context.events?.emit?.('player:evade', {
        phase: 'complete',
        position: this.position.clone(),
        displacement: this.position.distanceTo(this.evadeStartPosition),
      });
      this.evadeStartPosition.set(0, 0, 0);
    }

    if (this.position.y < -100) this.teleport(new Vector3(0, 2, 8));
  }

  lateUpdate(_delta, context) {
    if (!this.enabled || !context.state.isPlaying) return;
    this.#syncCamera(0, context.frameAlpha);
  }

  teleport(position, { yaw = this.yaw, pitch = this.pitch } = {}) {
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.#syncCamera(0, 1);
  }

  getSnapshot() {
    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      grounded: this.grounded,
      crouching: this.crouching,
      height: this.currentHeight,
    };
  }

  applyCombatImpulse({
    direction = null,
    intensity = 0.5,
    hitStop = 0,
    recoil = 1,
  } = {}) {
    const strength = MathUtils.clamp(Number(intensity) || 0, 0, 1);
    if (direction?.isVector3) {
      _impulseDirection.copy(direction).normalize();
      const localSide = (
        _impulseDirection.x * Math.cos(this.yaw)
        - _impulseDirection.z * Math.sin(this.yaw)
      );
      this.viewImpulse.yaw += localSide * 0.018 * strength * recoil;
      this.viewImpulse.roll -= localSide * 0.025 * strength * recoil;
    }
    this.viewImpulse.pitch += 0.012 * strength * recoil;
    this.viewImpulse.kick += 0.055 * strength * recoil;
    this.combatPauseRemaining = Math.max(
      this.combatPauseRemaining,
      MathUtils.clamp(Number(hitStop) || 0, 0, 0.09),
    );
  }

  #updateStance(delta) {
    const wantsCrouch = this.input.isDown('crouch');
    if (wantsCrouch) {
      this.crouching = true;
    } else if (
      this.collisionWorld.canOccupy(
        this.position,
        this.config.radius,
        this.config.standingHeight,
      )
    ) {
      this.crouching = false;
    }

    const targetHeight = this.crouching
      ? this.config.crouchingHeight
      : this.config.standingHeight;
    const targetEyeHeight = this.crouching
      ? this.config.crouchingEyeHeight
      : this.config.standingEyeHeight;

    this.currentHeight = MathUtils.damp(this.currentHeight, targetHeight, 18, delta);
    this.eyeHeight = MathUtils.damp(this.eyeHeight, targetEyeHeight, 18, delta);
  }

  #syncCamera(_delta, alpha) {
    _cameraOffset.lerpVectors(this.previousPosition, this.position, alpha);
    const bobX = Math.cos(this.bobTime * 0.5) * 0.022 * this.bobWeight;
    const bobY = Math.abs(Math.sin(this.bobTime)) * 0.034 * this.bobWeight;

    this.camera.position.set(
      _cameraOffset.x + Math.cos(this.yaw) * bobX,
      _cameraOffset.y + this.eyeHeight + bobY,
      _cameraOffset.z - Math.sin(this.yaw) * bobX,
    );
    this.camera.position.x += Math.sin(this.yaw) * this.viewImpulse.kick;
    this.camera.position.z += Math.cos(this.yaw) * this.viewImpulse.kick;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      this.pitch + this.viewImpulse.pitch,
      this.yaw + this.viewImpulse.yaw,
      this.viewImpulse.roll,
    );
  }
}

function moveToward(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

export { DEFAULT_CONFIG as FIRST_PERSON_DEFAULTS };
