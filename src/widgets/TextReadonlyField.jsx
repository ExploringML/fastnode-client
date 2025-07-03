import React from "react";

export default function TextReadonlyField({
	id,
	field = "value",
	value,
	spec,
}) {
	return (
		<div className="p-2 text-sm">
			<div
				id={`${id}-${field}`}
				className="py-0.5 h-7 w-full"
				title={value ?? spec.default ?? ""}
			>
				{value ?? spec.default ?? ""}
			</div>
		</div>
	);
}
