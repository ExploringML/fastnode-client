import React from "react";

export default function TextReadonlyField({
	id,
	field = "value",
	value,
	spec,
}) {
	return (
		<div className="max-w-[150px] text-sm">
			<div
				id={`${id}-${field}`}
				className="py-0.5 h-7 whitespace-nowrap overflow-hidden text-ellipsis"
				title={value ?? spec.default ?? ""}
			>
				{value ?? spec.default ?? ""}
			</div>
		</div>
	);
}
