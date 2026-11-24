const playArea = document.querySelector(".play-area");
const pieces = [...document.querySelectorAll(".piece")];
const targets = new Map(
  [...document.querySelectorAll(".target")].map((target) => [
    target.dataset.part,
    target,
  ]),
);
const screechSound = document.querySelector("#screech-sound");
const popSound = document.querySelector("#pop-sound");

let activePiece = null;
let pointerOffset = { x: 0, y: 0 };

function getAreaPosition(element) {
  const areaBounds = playArea.getBoundingClientRect();
  const elementBounds = element.getBoundingClientRect();

  return {
    x: elementBounds.left - areaBounds.left,
    y: elementBounds.top - areaBounds.top,
  };
}

function rectanglesOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function scatterPieces() {
  const areaBounds = playArea.getBoundingClientRect();
  const occupied = [...targets.values()].map((target) => {
    const position = getAreaPosition(target);
    const bounds = target.getBoundingClientRect();

    return {
      ...position,
      width: bounds.width,
      height: bounds.height,
    };
  });

  for (const piece of pieces) {
    const bounds = piece.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    let position;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      position = {
        x: Math.random() * Math.max(0, areaBounds.width - width),
        y: Math.random() * Math.max(0, areaBounds.height - height),
        width,
        height,
      };

      if (!occupied.some((obstacle) => rectanglesOverlap(position, obstacle))) {
        break;
      }
    }

    if (occupied.some((obstacle) => rectanglesOverlap(position, obstacle))) {
      const corners = [
        { x: 0, y: 0 },
        { x: areaBounds.width - width, y: 0 },
        { x: 0, y: areaBounds.height - height },
        { x: areaBounds.width - width, y: areaBounds.height - height },
      ];

      for (let index = corners.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [corners[index], corners[swapIndex]] = [corners[swapIndex], corners[index]];
      }

      const clearCorner = corners.find((corner) => {
        const candidate = { ...corner, width, height };
        return !occupied.some((obstacle) => rectanglesOverlap(candidate, obstacle));
      });

      if (clearCorner) {
        position = { ...clearCorner, width, height };
      }
    }

    piece.style.left = `${position.x}px`;
    piece.style.top = `${position.y}px`;
    occupied.push(position);
  }
}

function playSound(sound) {
  sound.currentTime = 0;
  sound.play().catch((error) => {
    console.error(`Unable to play ${sound.currentSrc}:`, error);
  });
}

function stopScreech() {
  screechSound.pause();
  screechSound.currentTime = 0;
}

function startDragging(event) {
  if (event.button !== 0 || activePiece || event.currentTarget.classList.contains("is-placed")) {
    return;
  }

  event.preventDefault();
  activePiece = event.currentTarget;
  activePiece.classList.add("is-dragging");
  activePiece.setPointerCapture(event.pointerId);

  const areaBounds = playArea.getBoundingClientRect();
  const pieceBounds = activePiece.getBoundingClientRect();
  pointerOffset = {
    x: event.clientX - pieceBounds.left,
    y: event.clientY - pieceBounds.top,
  };

  activePiece.style.left = `${pieceBounds.left - areaBounds.left}px`;
  activePiece.style.top = `${pieceBounds.top - areaBounds.top}px`;
  playSound(screechSound);
}

function movePiece(event) {
  if (!activePiece) {
    return;
  }

  const areaBounds = playArea.getBoundingClientRect();
  const pieceBounds = activePiece.getBoundingClientRect();
  const x = event.clientX - areaBounds.left - pointerOffset.x;
  const y = event.clientY - areaBounds.top - pointerOffset.y;

  activePiece.style.left = `${Math.max(0, Math.min(x, areaBounds.width - pieceBounds.width))}px`;
  activePiece.style.top = `${Math.max(0, Math.min(y, areaBounds.height - pieceBounds.height))}px`;
}

function finishDragging(event) {
  if (!activePiece) {
    return;
  }

  const piece = activePiece;
  const target = targets.get(piece.dataset.part);

  piece.classList.remove("is-dragging");
  if (piece.hasPointerCapture(event.pointerId)) {
    piece.releasePointerCapture(event.pointerId);
  }
  stopScreech();

  if (event.type !== "pointerup") {
    activePiece = null;
    return;
  }

  const pieceBounds = piece.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const distance = Math.hypot(
    pieceBounds.left + pieceBounds.width / 2 - (targetBounds.left + targetBounds.width / 2),
    pieceBounds.top + pieceBounds.height / 2 - (targetBounds.top + targetBounds.height / 2),
  );
  const snapDistance = Math.max(54, Math.min(100, targetBounds.width * 0.3));

  if (distance <= snapDistance) {
    const targetPosition = getAreaPosition(target);
    piece.style.left = `${targetPosition.x}px`;
    piece.style.top = `${targetPosition.y}px`;
    piece.classList.add("is-placed");
    playSound(popSound);
  }

  activePiece = null;
}

pieces.forEach((piece) => {
  piece.addEventListener("pointerdown", startDragging);
  piece.addEventListener("pointermove", movePiece);
  piece.addEventListener("pointerup", finishDragging);
  piece.addEventListener("pointercancel", finishDragging);
});

window.addEventListener("load", scatterPieces, { once: true });
