export default function LogLayout({ 
    children,
 }:{
    children: React.ReactNode; 
 }) {
    return (
    <div>
      <main>
        {children}
      </main>
    </div>
  );
}