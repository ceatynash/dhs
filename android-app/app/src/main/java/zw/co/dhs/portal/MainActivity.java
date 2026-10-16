package zw.co.dhs.portal;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PORTAL_URL = "https://dhs-portal.onrender.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openPortal();
    }

    private void openPortal() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PORTAL_URL));
        try {
            startActivity(intent);
            finish();
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "No browser is installed to open the DHS Portal.", Toast.LENGTH_LONG).show();
            finish();
        }
    }
}
