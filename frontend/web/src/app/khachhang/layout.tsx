import type { ReactNode } from 'react';
import Header from './_components/Header';
import Footer from './_components/Footer';

export default function KhachHangLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-[#F9F5EF] text-white">
            <Header />
            {children}
            <Footer />
        </div>
    );
}
