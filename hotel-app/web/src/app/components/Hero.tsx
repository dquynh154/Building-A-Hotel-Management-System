import Image from "next/image";
import BookingBar from "./booking/BookingBar";

export default function Hero() {
    return (
        <section className="relative">
            {/* Background image */}
            <div className="relative h-[56vh] min-h-[420px] w-full">
                {/* Replace /hero.jpg by putting an image in /public/hero.jpg */}
                <Image src="/hero.png" alt="Hero" fill priority className="object-cover" />
                {/* Dark gradient overlay */}
                <div className="absolute inset-0 bg-black/40" />

                {/* Headline */}
                <div className="absolute inset-0 flex items-center justify-center text-center px-4">
                    <div>
                        <h1 className="font-brand text-white text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight drop-shadow-lg uppercase tracking-tight">
                            LƯU TRÚ TRỌN VẸN 24 GIỜ<br />VỚI DỊCH VỤ 24/7
                        </h1>

                    </div>
                </div>
            </div>

            {/* Booking bar (floating) */}
            <div className="relative -mt-10 sm:-mt-12 md:-mt-14 z-10">
                <div className="mx-auto max-w-6xl px-4">
                    <BookingBar />
                </div>
            </div>
        </section>
    );
}
