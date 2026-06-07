import Header from '../shared/components/layout/Header';
import FileUpload from '../features/transactions/components/FileUpload';

export default function Import() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <Header
        title="Import Transactions"
        subtitle="Upload a CSV bank statement to import transactions"
      />
      <FileUpload />
    </div>
  );
}
