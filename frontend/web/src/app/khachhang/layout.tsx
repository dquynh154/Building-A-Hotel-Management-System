import type { ReactNode } from 'react';
import Header from './_components/Header';
import Footer from './_components/Footer';

export default function KhachHangLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-[#FDFCF9] text-white">
            <Header />
            {children}
            <Footer />
        </div>
    );
}
