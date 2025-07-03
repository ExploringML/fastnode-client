import React from "react";

function ImageDisplayField({ id, field = "image", value, spec }) {
	// console.log("ImageDisplayField", id, field, value, spec);

	if (!value) {
		return (
			<div className="min-w-[20px] min-h-[20px] flex-1 flex items-center justify-center text-sm text-gray-400">
				No image
			</div>
		);
	}

	return (
		<div className="_flex-1 overflow-hidden">
			<img
				id={`${id}-${field}`}
				src={value}
				alt="Generated"
				className="min-w-[40px] min-h-[40px] w-full h-full object-contain select-none pointer-events-none"
				draggable={false}
			/>
		</div>
	);
}

// Memoize the component to prevent unnecessary re-renders
export default React.memo(ImageDisplayField, (prev, next) =>
	prev.value === next.value &&
	prev.id === next.id &&
	prev.field === next.field
);
