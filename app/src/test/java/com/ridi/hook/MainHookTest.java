package com.ridi.hook;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class MainHookTest {

    @Test
    public void testIsTargetPackage() throws Exception {
        MainHook hook = new MainHook();
        java.lang.reflect.Method method = MainHook.class.getDeclaredMethod("isTargetPackage", String.class);
        method.setAccessible(true);

        assertTrue((Boolean) method.invoke(hook, "com.initialcoms.ridi"));
        assertTrue((Boolean) method.invoke(hook, "com.initialt.ridi"));
        assertTrue((Boolean) method.invoke(hook, "com.ridi.books"));
        assertFalse((Boolean) method.invoke(hook, "com.google.android.youtube"));
        assertFalse((Boolean) method.invoke(hook, (Object) null));
    }

    @Test
    public void testBase64PrefixStripping() {
        String dataUri = "data:application/epub+zip;base64,SGVsbG8gV29ybGQ=";
        int commaIdx = dataUri.indexOf(',');
        String rawBase64 = commaIdx >= 0 ? dataUri.substring(commaIdx + 1) : dataUri;
        assertEquals("SGVsbG8gV29ybGQ=", rawBase64);
    }
}
