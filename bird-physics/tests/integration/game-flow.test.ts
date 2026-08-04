import planck from "planck";
import { describe, expect, it } from "vitest";
import { ROUND_TIMEOUT_MS } from "../../src/core/constants";
import { evaluateRoundState, flushDestroyedBodies } from "../../src/core/game-state";
import { DEFAULT_LEVEL } from "../../src/core/level";
import { countAliveTargets, createPhysicsScene } from "../../src/core/scene";
import { ENTITY_KIND, ENTITY_ROLE } from "../../src/core/types";

describe("integration: game flow rules", () => {
  it("does not resolve defeat when bird is out of bounds but structure is still moving", () => {
    const scene = createPhysicsScene();
    const movingWood = [...scene.entities.values()].find((entity) => entity.kind === ENTITY_KIND.WOOD);
    if (!movingWood) {
      throw new Error("Expected at least one wood entity in default scene.");
    }

    scene.bird.body.setTransform(planck.Vec2(-4, scene.groundY - 1), 0);
    scene.bird.body.setLinearVelocity(planck.Vec2(0.01, 0));
    scene.bird.body.setAngularVelocity(0.01);
    movingWood.body.setLinearVelocity(planck.Vec2(0.6, 0));

    const next = evaluateRoundState(
      scene,
      {
        phase: "launched",
        result: "pending",
        launchedAtMs: 0,
        stationaryFrames: 0,
      },
      1_000,
    );

    expect(next.phase).toBe("launched");
    expect(next.result).toBe("pending");
  });

  it("resolves defeat on timeout when targets remain", () => {
    const scene = createPhysicsScene();
    for (const entity of scene.entities.values()) {
      entity.body.setLinearVelocity(planck.Vec2(0, 0));
      entity.body.setAngularVelocity(0);
    }
    scene.bird.body.setTransform(planck.Vec2(10, 10), 0);

    const next = evaluateRoundState(
      scene,
      {
        phase: "launched",
        result: "pending",
        launchedAtMs: 0,
        stationaryFrames: 0,
      },
      ROUND_TIMEOUT_MS + 1,
    );

    expect(next.phase).toBe("resolved");
    expect(next.result).toBe("defeat");
  });

  it("flushDestroyedBodies removes entities and returns score delta", () => {
    const scene = createPhysicsScene();
    const pig = [...scene.entities.values()].find((entity) => entity.roles.includes(ENTITY_ROLE.TARGET));
    if (!pig) {
      throw new Error("Expected at least one target entity in default scene.");
    }

    const pendingDestroy = new Set<string>([pig.id]);
    const scoreDelta = flushDestroyedBodies(scene, pendingDestroy);

    expect(scoreDelta).toBe(pig.scoreValue);
    expect(scene.entities.has(pig.id)).toBe(false);
    expect(scene.bodyToEntity.has(pig.body)).toBe(false);
    expect(pendingDestroy.size).toBe(0);
  });

  it("supports archetype + spawn composition for custom level variants", () => {
    const customLevel = {
      ...DEFAULT_LEVEL,
      entityTypes: {
        ...DEFAULT_LEVEL.entityTypes,
        pig_heavy: {
          ...DEFAULT_LEVEL.entityTypes.pig_basic,
          durability: {
            ...DEFAULT_LEVEL.entityTypes.pig_basic.durability,
            maxHealth: 12,
          },
        },
      },
      spawns: [
        ...DEFAULT_LEVEL.spawns.filter((spawn) => spawn.typeId !== "pig_basic"),
        { typeId: "pig_heavy", position: { x: 19.2, y: 12.5 } },
      ],
    };

    const scene = createPhysicsScene(customLevel);
    expect(countAliveTargets(scene)).toBe(1);
  });
});
