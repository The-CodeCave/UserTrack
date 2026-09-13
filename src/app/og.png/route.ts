import Image from "../(public)/opengraph-image";

export const revalidate = 300;

// The waitlist page advertised /og.png; old social previews that refetch it now get the live card.
export const GET = () => Image();
